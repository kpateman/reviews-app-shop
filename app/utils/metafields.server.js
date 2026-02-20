import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

let definitionsEnsured = false;

const DEFINITIONS = [
  { name: "Review Count", key: "review_count", type: "number_integer" },
  { name: "Average Rating", key: "average_rating", type: "number_decimal" },
];

/**
 * Creates the reviews_app metafield definitions (once per server lifecycle).
 * Enables storefront read access so the Liquid template can read them.
 * If definitions already exist, updates them to ensure PUBLIC_READ access.
 */
async function ensureMetafieldDefinitions(shop) {
  if (definitionsEnsured) return;

  try {
    const { admin } = await unauthenticated.admin(shop);
    for (const def of DEFINITIONS) {
      try {
        const createResp = await admin.graphql(`
          mutation {
            metafieldDefinitionCreate(definition: {
              name: "${def.name}"
              namespace: "reviews_app"
              key: "${def.key}"
              type: "${def.type}"
              ownerType: PRODUCT
              access: {
                storefront: PUBLIC_READ
              }
            }) {
              createdDefinition { id }
              userErrors { field message }
            }
          }
        `);
        const createData = await createResp.json();
        const userErrors = createData.data?.metafieldDefinitionCreate?.userErrors || [];
        const alreadyExists = userErrors.some(e => e.message?.toLowerCase().includes("already") || e.message?.toLowerCase().includes("taken"));

        if (alreadyExists) {
          // Definition exists — update it to ensure PUBLIC_READ storefront access
          await admin.graphql(`
            mutation {
              metafieldDefinitionUpdate(definition: {
                namespace: "reviews_app"
                key: "${def.key}"
                ownerType: PRODUCT
                access: {
                  storefront: PUBLIC_READ
                }
              }) {
                updatedDefinition { id }
                userErrors { field message }
              }
            }
          `);
        }
      } catch (err) {
        console.error(`Failed to ensure metafield definition "${def.key}":`, err?.message || err);
      }
    }
    definitionsEnsured = true;
  } catch (err) {
    console.error("Failed to ensure metafield definitions:", err?.message || err);
  }
}

/**
 * Counts approved product reviews and calculates average rating, then writes
 * both to the product's metafields. Called after any review status change.
 */
export async function updateProductReviewCount(shop, productId) {
  if (!productId) return;

  try {
    await ensureMetafieldDefinitions(shop);

    const stats = await prisma.review.aggregate({
      where: { shop, productId, status: "approved", type: "product" },
      _count: true,
      _avg: { rating: true },
    });

    const count = stats._count;
    const avgRating = stats._avg.rating ? Number(stats._avg.rating.toFixed(1)) : 0;

    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(`
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [
          {
            ownerId: productId,
            namespace: "reviews_app",
            key: "review_count",
            type: "number_integer",
            value: String(count),
          },
          {
            ownerId: productId,
            namespace: "reviews_app",
            key: "average_rating",
            type: "number_decimal",
            value: String(avgRating),
          },
        ],
      },
    });

    const data = await response.json();
    if (data.data?.metafieldsSet?.userErrors?.length > 0) {
      console.error("Metafield update errors:", data.data.metafieldsSet.userErrors);
    }
  } catch (err) {
    console.error("Failed to update product review metafields:", err?.message || err);
  }
}

/**
 * Backfills metafields for ALL products that have approved reviews.
 * Called when the merchant enables schema markup in settings.
 */
export async function backfillProductMetafields(shop) {
  try {
    await ensureMetafieldDefinitions(shop);

    const products = await prisma.review.findMany({
      where: { shop, status: "approved", type: "product" },
      select: { productId: true },
      distinct: ["productId"],
    });

    console.log(`Backfilling metafields for ${products.length} products on ${shop}`);

    for (const { productId } of products) {
      await updateProductReviewCount(shop, productId);
    }

    console.log(`Metafield backfill complete for ${shop}`);
  } catch (err) {
    console.error("Failed to backfill product metafields:", err?.message || err);
  }
}
