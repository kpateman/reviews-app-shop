import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import cache from "../utils/cache.server";
import { cdnify } from "../utils/images.server";
import { checkRateLimit } from "../utils/rate-limiter.server";
import { validateImageUrl } from "../utils/image-validation.server";

// Helper to return JSON responses
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Check if customer has purchased the product
// Uses customer ID (from signed Shopify params) to search orders
async function checkVerifiedPurchase(shop, customerId, customerEmail, productId) {
  try {
    const { admin } = await unauthenticated.admin(shop);

    const productNumericId = String(productId).split("/").pop();
    const customerNumericId = String(customerId).split("/").pop();

    const response = await admin.graphql(`
      query {
        orders(first: 50, query: "customer_id:${customerNumericId}") {
          edges {
            node {
              id
              lineItems(first: 50) {
                edges {
                  node {
                    product {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const data = await response.json();
    if (data.data?.orders?.edges) {
      for (const orderEdge of data.data.orders.edges) {
        const order = orderEdge.node;
        for (const lineItemEdge of order.lineItems.edges) {
          const lineItemProductId = lineItemEdge.node.product?.id;
          if (lineItemProductId && lineItemProductId.includes(productNumericId)) {
            return order.id;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error checking verified purchase:", error?.message || error);
    return null;
  }
}

export async function loader({ request }) {
  let shop = null;
  try {
    const { session } = await authenticate.public.appProxy(request);
    shop = session?.shop;
  } catch (authErr) {
    // In development allow using ?shop=... to test app-proxy without signed params
    if (process.env.NODE_ENV === "development" || process.env.DEV_BYPASS_APP_PROXY === "1") {
      const url = new URL(request.url);
      shop = url.searchParams.get("shop");
    } else {
      console.error("app-proxy auth error:", authErr?.message || authErr);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const type = url.searchParams.get("type") || "product";
  const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
  const perPage = Math.min(Number(url.searchParams.get("perPage") || 20), 50);

  if (!shop) return jsonResponse({ error: "Unauthorized" }, 401);

  const cacheKey = `app-proxy:reviews:${shop}:${type}:${productId || 'all'}:p${page}:n${perPage}`;
  try {
    const cached = await cache.get(cacheKey);
    if (cached) return jsonResponse(cached);
  } catch (e) { }

  let reviews = [];
  const skip = (page - 1) * perPage;

  if (type === "product" && productId) {
    reviews = await prisma.review.findMany({
      where: { shop, status: "approved", productId: productId, type: "product" },
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
        reply: true,
        repliedAt: true,
        images: { select: { url: true, status: true } },
      },
    });

    if (reviews.length === 0 && productId.includes("/")) {
      const numericId = productId.split("/").pop();
      reviews = await prisma.review.findMany({
        where: { shop, status: "approved", productId: { contains: numericId }, type: "product" },
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
          reply: true,
          repliedAt: true,
          images: { select: { url: true, status: true } },
        },
      });
    }
  } else if (type === "company") {
    reviews = await prisma.review.findMany({
      where: { shop, status: "approved", type: "company" },
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
        reply: true,
        repliedAt: true,
        images: { select: { url: true, status: true } },
      },
    });
  } else {
    reviews = await prisma.review.findMany({
      where: { shop, status: "approved" },
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
        reply: true,
        repliedAt: true,
        images: { select: { url: true, status: true } },
      },
    });
  }

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  let shopSettings = null;
  try {
    shopSettings = await prisma.shopSettings.findUnique({ where: { shop } });
  } catch (dbErr) {
    console.error("ShopSettings fetch error (falling back to defaults):", dbErr?.message || dbErr);
    shopSettings = null;
  }
  if (!shopSettings) shopSettings = { enableSchemaMarkup: true, requireVerifiedPurchase: false, autoApproveReviews: false };

  const payload = {
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      content: r.content,
      customerName: r.customerName,
      verifiedPurchase: !!r.orderId,
      createdAt: r.createdAt,
      reply: r.reply,
      repliedAt: r.repliedAt,
      images: r.images.filter((img) => img.status === "approved").map((img) => ({ url: cdnify(img.url) })),
    })),
    summary: { count: reviews.length, averageRating: Math.round(avgRating * 10) / 10 },
    settings: { enableSchemaMarkup: shopSettings.enableSchemaMarkup },
  };

  try { await cache.set(cacheKey, payload, 60); } catch (e) { }
  return jsonResponse(payload);
}

export async function action({ request }) {
  let shop = null;
  try {
    const { session } = await authenticate.public.appProxy(request);
    shop = session?.shop;
  } catch (authErr) {
    if (process.env.NODE_ENV === "development" || process.env.DEV_BYPASS_APP_PROXY === "1") {
      const url = new URL(request.url);
      shop = url.searchParams.get("shop");
    } else {
      console.error("app-proxy auth error:", authErr?.message || authErr);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  if (!shop) return jsonResponse({ error: "Unauthorized" }, 401);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const url = new URL(request.url);
    const signedCustomerId = url.searchParams.get("logged_in_customer_id");
    const formData = await request.formData();

    const productId = formData.get("productId");
    const productTitle = formData.get("productTitle");
    const type = formData.get("type") || "product";
    const rating = parseInt(formData.get("rating"), 10);
    const title = formData.get("title");
    const content = formData.get("content");
    const customerEmail = formData.get("customerEmail");
    const customerName = formData.get("customerName");

    const customerId = signedCustomerId ? `gid://shopify/Customer/${signedCustomerId}` : formData.get("customerId");
    const hasVerifiedCustomer = !!signedCustomerId;

    if (!customerEmail || !customerName || !rating || !title || !content) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }
    if (rating < 1 || rating > 5) return jsonResponse({ error: "Rating must be between 1 and 5" }, 400);
    if (type === "product" && !productId) return jsonResponse({ error: "Product ID required for product reviews" }, 400);

    // Rate limit: 5 reviews per hour per customer per shop
    const rl = await checkRateLimit(`rl:review:${shop}:${customerEmail}`);
    if (!rl.allowed) {
      return jsonResponse({ error: "Too many reviews submitted. Please try again later.", retryAfter: rl.retryAfterSeconds }, 429);
    }

    const existingReview = await prisma.review.findFirst({ where: { shop, customerEmail, productId: type === "product" ? productId : null, type } });
    if (existingReview) return jsonResponse({ error: "You have already submitted a review for this product" }, 400);

    let shopSettings = await prisma.shopSettings.findUnique({ where: { shop } });
    if (!shopSettings) shopSettings = { requireVerifiedPurchase: false, autoApproveReviews: false };

    let orderId = null;
    if (type === "product" && productId && hasVerifiedCustomer) {
      orderId = await checkVerifiedPurchase(shop, customerId, customerEmail, productId);
      if (shopSettings.requireVerifiedPurchase && !orderId) {
        return jsonResponse({ error: "Only customers who have purchased this product can leave a review." }, 403);
      }
    } else if (type === "product" && shopSettings.requireVerifiedPurchase && !hasVerifiedCustomer) {
      return jsonResponse({ error: "Please log in to your account to leave a verified review." }, 403);
    }

    const status = shopSettings.autoApproveReviews ? "approved" : "pending";

    const imagesJson = formData.get("images");
    let images = [];
    if (imagesJson) {
      try { images = JSON.parse(imagesJson); } catch (e) { console.error("Error parsing images:", e); }
    }

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
        status,
      },
    });

    let imagesSaved = 0;
    let imagesRejected = 0;
    const imagesData = images || [];

    for (const img of imagesData.slice(0, 2)) {
      try {
        const validation = await validateImageUrl(img.url);
        if (!validation.valid) {
          console.warn(`Image rejected for review ${review.id}: ${validation.error}`);
          imagesRejected++;
          continue;
        }

        await prisma.reviewImage.create({
          data: {
            reviewId: review.id,
            filename: img.name || "image.jpg",
            url: img.url,
            cloudinaryPublicId: img.publicId || null,
            status: "pending",
          },
        });
        imagesSaved++;
      } catch (imgError) {
        console.error("Error saving image to database:", imgError?.message || imgError);
      }
    }

    // Invalidate caches
    try {
      await cache.delByPrefix(`app-proxy:reviews:${shop}:`);
      await cache.delByPrefix(`reviews:${shop}:`);
    } catch (e) { }

    let message = orderId ? "Thank you! Your verified purchase review has been submitted" : "Thank you! Your review has been submitted";
    message += shopSettings.autoApproveReviews ? " and is now live!" : " and is pending approval.";
    if (imagesSaved > 0) message += ` ${imagesSaved} photo(s) uploaded and pending approval.`;
    if (imagesRejected > 0) message += ` ${imagesRejected} photo(s) could not be saved.`;

    return jsonResponse({ success: true, verifiedPurchase: !!orderId, imagesSaved, message }, 201);
  } catch (error) {
    console.error("Error creating review:", error);
    return jsonResponse({ error: "Failed to create review" }, 500);
  }
}
