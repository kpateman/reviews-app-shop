import { authenticate } from "../shopify.server";
import { generateReviewToken, buildReviewUrl } from "../utils/review-tokens.server";
import { sendReviewRequestEmail } from "../utils/email.server";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function action({ request }) {
  const { payload, admin } = await authenticate.flow(request);

  const { shopify_domain, properties } = payload;
  const orderId = properties?.order_id;

  if (!orderId) {
    return jsonResponse({ message: "Missing order_id in payload" }, 400);
  }

  // Query order for customer info, line items, and product images
  const response = await admin.graphql(
    `#graphql
    query GetOrderForReview($id: ID!) {
      order(id: $id) {
        id
        name
        customer {
          id
          firstName
          lastName
          defaultEmailAddress {
            emailAddress
          }
        }
        lineItems(first: 10) {
          edges {
            node {
              product {
                id
                title
                featuredMedia {
                  preview {
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { id: orderId } },
  );

  const data = await response.json();
  const order = data.data?.order;

  if (!order) {
    return jsonResponse({ message: "Order not found" }, 400);
  }

  const customer = order.customer;
  if (!customer || !customer.defaultEmailAddress?.emailAddress) {
    return jsonResponse({ message: "Order has no customer email" }, 400);
  }

  const customerEmail = customer.defaultEmailAddress.emailAddress;
  const customerFirstName = customer.firstName || "";
  const customerLastName = customer.lastName || "";
  const customerName = [customerFirstName, customerLastName].filter(Boolean).join(" ") || customerEmail;
  const customerId = customer.id;

  // Extract unique products from line items (skip items without a product, e.g. tips)
  const seenProductIds = new Set();
  const products = [];
  for (const edge of order.lineItems.edges) {
    const product = edge.node.product;
    if (!product?.id || seenProductIds.has(product.id)) continue;
    seenProductIds.add(product.id);
    const imageUrl = product.featuredMedia?.preview?.image?.url || null;
    products.push({ id: product.id, title: product.title, imageUrl });
  }

  // Generate tokens and build URLs for each product
  const productLinks = [];
  for (const product of products) {
    try {
      const { token } = await generateReviewToken({
        shop: shopify_domain,
        productId: product.id,
        productTitle: product.title,
        customerId,
        customerEmail,
        customerName,
        orderId: order.id,
      });

      productLinks.push({
        productTitle: product.title,
        reviewUrl: buildReviewUrl(shopify_domain, token),
        fiveStarUrl: buildReviewUrl(shopify_domain, token, 5),
        fourStarUrl: buildReviewUrl(shopify_domain, token, 4),
        threeStarUrl: buildReviewUrl(shopify_domain, token, 3),
        imageUrl: product.imageUrl,
      });
    } catch (err) {
      console.error(`Failed to generate token for product ${product.id}:`, err?.message || err);
    }
  }

  // Send the review request email
  if (productLinks.length > 0) {
    const emailResult = await sendReviewRequestEmail({
      to: customerEmail,
      customerName: customerFirstName || customerName,
      orderName: order.name || "",
      shopDomain: shopify_domain,
      products: productLinks,
    });

    if (!emailResult.success) {
      console.error("Review email failed:", emailResult.error);
    }
  }

  return jsonResponse({
    return_value: {
      customerFirstName: customerFirstName || customerName,
      customerEmail,
      orderName: order.name || "",
      productCount: productLinks.length,
      products: productLinks,
    },
  });
}
