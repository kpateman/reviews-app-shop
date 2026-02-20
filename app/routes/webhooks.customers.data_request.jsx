import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const customerId = payload.customer?.id
    ? `gid://shopify/Customer/${payload.customer.id}`
    : null;
  const customerEmail = payload.customer?.email;

  // Find all reviews and tokens containing this customer's data
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

  console.log(
    `Customer data request for ${shop}: found ${reviews.length} reviews, ${tokens.length} tokens`,
  );

  // Shopify expects a 200 response. The actual data export is handled
  // by responding to the email Shopify sends to the store owner.
  // We log what we have so the store owner can compile the response.

  return new Response();
};
