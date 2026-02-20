import prisma from "../db.server";
import cache from "../utils/cache.server";
import { cdnify } from "../utils/images.server";
import { checkRateLimit } from "../utils/rate-limiter.server";

// Helper to return JSON responses
function jsonResponse(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...headers,
    },
  });
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const type = url.searchParams.get("type") || "product";
  const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
  const perPage = Math.min(Number(url.searchParams.get("perPage") || 20), 100);

  if (!shop) {
    return jsonResponse({ error: "Shop parameter required" }, { status: 400 });
  }

  const where = {
    shop,
    status: "approved",
  };

  if (type === "product" && productId) {
    where.productId = productId;
    where.type = "product";
  } else if (type === "company") {
    where.type = "company";
  }

  // Pagination + optimized queries: select only used fields and use aggregate
  const skip = (page - 1) * perPage;

  const cacheKey = `reviews:${shop}:${type}:${productId || 'all'}:p${page}:n${perPage}`;
  const cached = await cache.get(cacheKey);
  if (cached) return jsonResponse(cached);

  const [reviews, totalCount, avgResult] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: perPage,
      skip,
      select: {
        id: true,
        rating: true,
        title: true,
        content: true,
        customerName: true,
        orderId: true,
        createdAt: true,
        images: { select: { url: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.aggregate({ _avg: { rating: true }, where }),
  ]);

  const avgRating = avgResult._avg && avgResult._avg.rating ? avgResult._avg.rating : 0;

  const payload = {
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      content: r.content,
      customerName: r.customerName,
      verifiedPurchase: !!r.orderId,
      createdAt: r.createdAt,
      images: r.images.map((img) => ({ url: cdnify(img.url) })),
    })),
    summary: {
      count: totalCount,
      page,
      perPage,
      averageRating: Math.round((avgRating || 0) * 10) / 10,
    },
  };

  // Cache short-lived (60s)
  try { await cache.set(cacheKey, payload, 60); } catch (e) { /* ignore cache errors */ }

  return jsonResponse(payload);
}

export async function action({ request }) {
  // Handle OPTIONS for CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const {
      shop,
      productId,
      productTitle,
      customerId,
      customerEmail,
      customerName,
      orderId,
      type,
      rating,
      title,
      content,
    } = body;

    // Validate required fields
    if (!shop || !customerEmail || !customerName || !rating || !title || !content || !type) {
      return jsonResponse({ error: "Missing required fields" }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return jsonResponse({ error: "Rating must be between 1 and 5" }, { status: 400 });
    }

    if (type !== "product" && type !== "company") {
      return jsonResponse({ error: "Type must be 'product' or 'company'" }, { status: 400 });
    }

    if (title.length > 100) {
      return jsonResponse({ error: "Title must be 100 characters or fewer" }, { status: 400 });
    }
    if (content.length > 1000) {
      return jsonResponse({ error: "Review must be 1,000 characters or fewer" }, { status: 400 });
    }

    // Rate limit: 5 reviews per hour per customer per shop
    const rl = await checkRateLimit(`rl:review:${shop}:${customerEmail}`);
    if (!rl.allowed) {
      return jsonResponse(
        { error: "Too many reviews submitted. Please try again later.", retryAfter: rl.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }

    // For product reviews, require productId
    if (type === "product" && !productId) {
      return jsonResponse({ error: "Product ID required for product reviews" }, { status: 400 });
    }

    // Check for duplicate review
    const existingReview = await prisma.review.findFirst({
      where: {
        shop,
        customerEmail,
        productId: type === "product" ? productId : null,
        type,
      },
    });

    if (existingReview) {
      return jsonResponse({ error: "You have already submitted a review" }, { status: 400 });
    }

    // Create the review
    const review = await prisma.review.create({
      data: {
        shop,
        productId: type === "product" ? productId : null,
        productTitle: type === "product" ? productTitle : null,
        customerId,
        customerEmail,
        customerName,
        orderId,
        type,
        rating,
        title,
        content,
        status: "pending", // Reviews start as pending for moderation
      },
    });

    return jsonResponse({
      success: true,
      review: {
        id: review.id,
        status: review.status,
      },
      message: "Thank you! Your review has been submitted and is pending approval.",
    }, { status: 201 });

  } catch (error) {
    console.error("Error creating review:", error);
    return jsonResponse({ error: "Failed to create review" }, { status: 500 });
  }
}
