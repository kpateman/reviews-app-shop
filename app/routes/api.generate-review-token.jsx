import { authenticate } from "../shopify.server";
import { generateReviewToken, buildReviewUrl } from "../utils/review-tokens.server";
import { checkRateLimit } from "../utils/rate-limiter.server";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // Rate limit: 100 tokens per hour per shop
  const rl = await checkRateLimit(`rl:token-gen:${shop}`, 100, 3600);
  if (!rl.allowed) return jsonResponse({ error: "Too many token requests. Please try again later." }, 429);

  try {
    const body = await request.json();
    const { productId, productTitle, customerId, customerEmail, customerName, orderId } = body;

    if (!productId || !productTitle || !customerEmail || !customerName) {
      return jsonResponse({ error: "Missing required fields: productId, productTitle, customerEmail, customerName" }, 400);
    }

    const { token } = await generateReviewToken({
      shop, productId, productTitle, customerId, customerEmail, customerName, orderId,
    });

    // Build URLs for each star rating (1-5)
    const reviewUrls = {};
    for (let i = 1; i <= 5; i++) {
      reviewUrls[i] = buildReviewUrl(shop, token, i);
    }

    return jsonResponse({ token, reviewUrl: buildReviewUrl(shop, token), reviewUrls });
  } catch (error) {
    console.error("Error generating review token:", error);
    return jsonResponse({ error: "Failed to generate review token" }, 500);
  }
}
