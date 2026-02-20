import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Delete all app data for this shop
  await db.reviewRequestToken.deleteMany({ where: { shop } });
  await db.reviewImage.deleteMany({
    where: { review: { shop } },
  });
  await db.review.deleteMany({ where: { shop } });
  await db.shopSettings.deleteMany({ where: { shop } });
  await db.session.deleteMany({ where: { shop } });

  console.log(`All data redacted for shop ${shop}`);

  return new Response();
};
