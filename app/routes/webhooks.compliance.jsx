import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteImageFromCloudinary } from "../utils/cloudinary.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received compliance webhook ${topic} for ${shop}`);

  if (topic === "CUSTOMERS_DATA_REQUEST") {
    const customerId = payload.customer?.id
      ? `gid://shopify/Customer/${payload.customer.id}`
      : null;
    const customerEmail = payload.customer?.email;

    const reviews = await db.review.findMany({
      where: {
        shop,
        OR: [
          ...(customerId ? [{ customerId }] : []),
          ...(customerEmail ? [{ customerEmail }] : []),
        ],
      },
      include: { images: true },
    });

    const tokens = await db.reviewRequestToken.findMany({
      where: {
        shop,
        OR: [
          ...(customerId ? [{ customerId }] : []),
          ...(customerEmail ? [{ customerEmail }] : []),
        ],
      },
    });

    // Shopify expects a 200. The store owner must respond to
    // the data request email Shopify sends them separately.
    console.log(
      `Data request for ${shop}: ${reviews.length} reviews, ${tokens.length} tokens on record`,
    );
  } else if (topic === "CUSTOMERS_REDACT") {
    const customerId = payload.customer?.id
      ? `gid://shopify/Customer/${payload.customer.id}`
      : null;
    const customerEmail = payload.customer?.email;

    const where = {
      shop,
      OR: [
        ...(customerId ? [{ customerId }] : []),
        ...(customerEmail ? [{ customerEmail }] : []),
      ],
    };

    // Anonymise reviews — keep content/rating but strip all PII
    await db.review.updateMany({
      where,
      data: {
        customerId: null,
        customerEmail: "redacted@redacted.com",
        customerName: "Anonymous",
        orderId: null,
      },
    });

    // Delete tokens — they're transient and tied to the customer identity
    await db.reviewRequestToken.deleteMany({ where });

    console.log(`Customer data redacted for ${shop}`);
  } else if (topic === "SHOP_REDACT") {
    // Sent 48 hours after a merchant uninstalls — delete everything
    await db.reviewRequestToken.deleteMany({ where: { shop } });
    const images = await db.reviewImage.findMany({ where: { review: { shop } }, select: { cloudinaryPublicId: true } });
    await Promise.all(images.map(img => img.cloudinaryPublicId ? deleteImageFromCloudinary(img.cloudinaryPublicId) : null));
    await db.reviewImage.deleteMany({ where: { review: { shop } } });
    await db.review.deleteMany({ where: { shop } });
    await db.shopSettings.deleteMany({ where: { shop } });
    await db.session.deleteMany({ where: { shop } });

    console.log(`All data deleted for shop ${shop}`);
  }

  return new Response();
};
