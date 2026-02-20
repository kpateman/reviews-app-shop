import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

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

  // Anonymize reviews — keep the review content/rating but remove PII
  await db.review.updateMany({
    where,
    data: {
      customerId: null,
      customerEmail: "redacted@redacted.com",
      customerName: "Redacted",
      orderId: null,
    },
  });

  // Delete review request tokens entirely (they're transient)
  await db.reviewRequestToken.deleteMany({ where });

  console.log(`Customer data redacted for ${shop}`);

  return new Response();
};
