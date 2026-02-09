import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { useState } from "react";
import prisma from "../db.server";
import cache from "../utils/cache.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
  const perPage = Math.min(Number(url.searchParams.get("perPage") || 20), 100);

  const where = { shop };
  const skip = (page - 1) * perPage;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: perPage,
      skip,
      select: {
        id: true,
        shop: true,
        productId: true,
        productTitle: true,
        customerEmail: true,
        customerName: true,
        rating: true,
        title: true,
        content: true,
        status: true,
        type: true,
        orderId: true,
        reply: true,
        repliedAt: true,
        createdAt: true,
        images: { select: { id: true, filename: true, url: true, status: true, cloudinaryPublicId: true } },
      },
    }),
    prisma.review.count({ where }),
  ]);

  return { reviews, page, perPage, total };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");
  const reviewId = formData.get("reviewId");

  if (actionType === "approve") {
    await prisma.review.update({
      where: { id: reviewId, shop },
      data: { status: "approved" },
    });
    try { await cache.delByPrefix(`app-proxy:reviews:${shop}:`); await cache.delByPrefix(`reviews:${shop}:`); } catch(e){}
  } else if (actionType === "reject") {
    await prisma.review.update({
      where: { id: reviewId, shop },
      data: { status: "rejected" },
    });
    try { await cache.delByPrefix(`app-proxy:reviews:${shop}:`); await cache.delByPrefix(`reviews:${shop}:`); } catch(e){}
  } else if (actionType === "delete") {
    // Fetch images to delete from Cloudinary
    const images = await prisma.reviewImage.findMany({
      where: { reviewId },
    });
    // Delete from Cloudinary
    for (const img of images) {
      if (img.cloudinaryPublicId) {
        try {
          await deleteImageFromCloudinary(img.cloudinaryPublicId);
        } catch (err) {
          console.error("Failed to delete image from Cloudinary:", err?.message || err);
        }
      }
    }
    // Delete review (cascade will delete images from DB)
    await prisma.review.delete({
      where: { id: reviewId, shop },
    });
    try { await cache.delByPrefix(`app-proxy:reviews:${shop}:`); await cache.delByPrefix(`reviews:${shop}:`); } catch(e){}
  } else if (actionType === "reply") {
    const reply = formData.get("reply");
    await prisma.review.update({
      where: { id: reviewId, shop },
      data: {
        reply: reply || null,
        repliedAt: reply ? new Date() : null,
      },
    });
    try { await cache.delByPrefix(`app-proxy:reviews:${shop}:`); await cache.delByPrefix(`reviews:${shop}:`); } catch(e){}
  } else if (actionType === "toggleImage") {
    const imageId = formData.get("imageId");
    const approved = formData.get("approved") === "true";
    await prisma.reviewImage.update({
      where: { id: imageId },
      data: { status: approved ? "approved" : "rejected" },
    });
    try { await cache.delByPrefix(`app-proxy:reviews:${shop}:`); await cache.delByPrefix(`reviews:${shop}:`); } catch(e){}
  }

  return { success: true };
}

export default function ReviewsPage() {
  const { reviews, page, perPage, total } = useLoaderData();
  const [statusFilter, setStatusFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const fetcher = useFetcher();

  // Get unique products from reviews
  const products = [...new Map(
    reviews
      .filter(r => r.productId && r.productTitle)
      .map(r => [r.productId, { id: r.productId, title: r.productTitle }])
  ).values()];

  const filteredReviews = reviews.filter((review) => {
    const statusMatch = statusFilter === "all" || review.status === statusFilter;
    const ratingMatch = ratingFilter === "all" || review.rating === parseInt(ratingFilter);
    const productMatch = productFilter === "all" || review.productId === productFilter;
    return statusMatch && ratingMatch && productMatch;
  });

  const starRating = (rating) => "★".repeat(rating) + "☆".repeat(5 - rating);

  const statusTone = (status) => {
    if (status === "approved") return "success";
    if (status === "pending") return "warning";
    if (status === "rejected") return "critical";
    return "default";
  };

  const startReply = (review) => {
    setReplyingTo(review.id);
    setReplyText(review.reply || "");
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setReplyText("");
  };

  const countByRating = (stars) => reviews.filter(r => r.rating === stars).length;

  return (
    <s-page heading="Reviews">
      <div style={{ display: "flex", gap: "24px" }}>
        {/* Filters Sidebar */}
        <div style={{ width: "200px", flexShrink: 0 }}>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="loose">
              {/* Status Filter */}
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Status</s-text>
                <s-stack direction="block" gap="tight">
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="status" checked={statusFilter === "all"} onChange={() => setStatusFilter("all")} />
                    <span>All ({reviews.length})</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="status" checked={statusFilter === "pending"} onChange={() => setStatusFilter("pending")} />
                    <span>Pending ({reviews.filter(r => r.status === "pending").length})</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="status" checked={statusFilter === "approved"} onChange={() => setStatusFilter("approved")} />
                    <span>Approved ({reviews.filter(r => r.status === "approved").length})</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="status" checked={statusFilter === "rejected"} onChange={() => setStatusFilter("rejected")} />
                    <span>Rejected ({reviews.filter(r => r.status === "rejected").length})</span>
                  </label>
                </s-stack>
              </s-stack>

              <s-divider />

              {/* Rating Filter */}
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Rating</s-text>
                <s-stack direction="block" gap="tight">
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="rating" checked={ratingFilter === "all"} onChange={() => setRatingFilter("all")} />
                    <span>All ratings</span>
                  </label>
                  {[5, 4, 3, 2, 1].map((stars) => (
                    <label key={stars} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input type="radio" name="rating" checked={ratingFilter === String(stars)} onChange={() => setRatingFilter(String(stars))} />
                      <span style={{ color: "#f5a623" }}>{starRating(stars)}</span>
                      <span style={{ color: "#888", fontSize: "12px" }}>({countByRating(stars)})</span>
                    </label>
                  ))}
                </s-stack>
              </s-stack>

              {products.length > 0 && (
                <>
                  <s-divider />

                  {/* Product Filter */}
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingSm">Product</s-text>
                    <select
                      value={productFilter}
                      onChange={(e) => setProductFilter(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        fontSize: "14px"
                      }}
                    >
                      <option value="all">All products</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.title}
                        </option>
                      ))}
                    </select>
                  </s-stack>
                </>
              )}
            </s-stack>
          </s-box>
        </div>

        {/* Reviews List */}
        <div style={{ flex: 1 }}>
          <s-text tone="subdued" style={{ marginBottom: "12px" }}>
            Showing {filteredReviews.length} of {reviews.length} reviews
          </s-text>
      <s-section>
        {filteredReviews.length === 0 ? (
          <s-box padding="loose" background="subdued" borderRadius="base">
            <s-text tone="subdued">No reviews found.</s-text>
          </s-box>
        ) : (
          <s-stack direction="block" gap="base">
            {filteredReviews.map((review) => (
              <s-box
                key={review.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" align="space-between">
                    <s-text variant="headingSm">{review.title}</s-text>
                    <s-badge tone={statusTone(review.status)}>{review.status}</s-badge>
                  </s-stack>

                  <s-stack direction="inline" gap="base">
                    <s-text tone="warning">{starRating(review.rating)}</s-text>
                    <s-badge>{review.type}</s-badge>
                  </s-stack>

                  <s-text>{review.content}</s-text>

                  <s-stack direction="inline" gap="tight">
                    <s-text tone="subdued">
                      by {review.customerName} • {review.type === "product" ? review.productTitle || "Product" : "Company Review"} • {new Date(review.createdAt).toLocaleDateString()}
                    </s-text>
                    {review.orderId && <s-badge tone="success">✓ Verified Purchase</s-badge>}
                  </s-stack>

                  {/* Show images with approval controls */}
                  {review.images && review.images.length > 0 && (
                    <s-box padding="base" background="subdued" borderRadius="base">
                      <s-stack direction="block" gap="base">
                        <s-text variant="headingSm">Customer Photos ({review.images.length})</s-text>
                        <s-stack direction="inline" gap="loose" wrap="wrap">
                          {review.images.map((image) => (
                            <s-stack key={image.id} direction="block" gap="tight" align="center">
                              <img
                                src={image.url}
                                alt={image.filename}
                                loading="lazy"
                                width={100}
                                height={100}
                                style={{
                                  objectFit: "cover",
                                  borderRadius: "4px",
                                  border: image.status === "approved" ? "2px solid #27ae60" : "2px solid #ccc",
                                  opacity: image.status === "approved" ? 1 : 0.6
                                }}
                              />
                              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                                <input
                                  type="checkbox"
                                  checked={image.status === "approved"}
                                  onChange={(e) => {
                                    const form = document.createElement("form");
                                    form.method = "POST";
                                    form.innerHTML = `
                                      <input name="action" value="toggleImage" />
                                      <input name="imageId" value="${image.id}" />
                                      <input name="approved" value="${e.target.checked}" />
                                    `;
                                    document.body.appendChild(form);
                                    fetcher.submit(form);
                                    document.body.removeChild(form);
                                  }}
                                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                                />
                                <span style={{ fontSize: "13px", color: image.status === "approved" ? "#27ae60" : "#888" }}>
                                  {image.status === "approved" ? "Approved" : "Not shown"}
                                </span>
                              </label>
                            </s-stack>
                          ))}
                        </s-stack>
                      </s-stack>
                    </s-box>
                  )}

                  {/* Show existing reply */}
                  {review.reply && replyingTo !== review.id && (
                    <s-box padding="base" background="subdued" borderRadius="base">
                      <s-stack direction="block" gap="tight">
                        <s-text variant="headingSm">Your Reply:</s-text>
                        <s-text>{review.reply}</s-text>
                        <s-text tone="subdued">
                          Replied on {new Date(review.repliedAt).toLocaleDateString()}
                        </s-text>
                      </s-stack>
                    </s-box>
                  )}

                  {/* Reply form */}
                  {replyingTo === review.id ? (
                    <s-box padding="base" background="subdued" borderRadius="base">
                      <fetcher.Form method="post">
                        <input type="hidden" name="action" value="reply" />
                        <input type="hidden" name="reviewId" value={review.id} />
                        <s-stack direction="block" gap="base">
                          <s-text variant="headingSm">{review.reply ? "Edit Reply" : "Write a Reply"}</s-text>
                          <textarea
                            name="reply"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            rows="3"
                            style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
                            placeholder="Write your reply to this customer..."
                          />
                          <s-stack direction="inline" gap="base">
                            <s-button variant="primary" type="submit" onClick={() => setTimeout(cancelReply, 100)}>
                              Save Reply
                            </s-button>
                            <s-button variant="tertiary" onClick={cancelReply}>
                              Cancel
                            </s-button>
                            {review.reply && (
                              <s-button
                                tone="critical"
                                type="submit"
                                onClick={() => { setReplyText(""); setTimeout(cancelReply, 100); }}
                              >
                                Remove Reply
                              </s-button>
                            )}
                          </s-stack>
                        </s-stack>
                      </fetcher.Form>
                    </s-box>
                  ) : null}

                  <s-divider />

                  <s-stack direction="inline" gap="base">
                    <fetcher.Form method="post" style={{ display: "inline" }}>
                      <input type="hidden" name="action" value="approve" />
                      <input type="hidden" name="reviewId" value={review.id} />
                      <s-button
                        variant="primary"
                        type="submit"
                        disabled={review.status === "approved"}
                      >
                        {review.status === "approved" ? "✓ Approved" : "Approve"}
                      </s-button>
                    </fetcher.Form>

                    <fetcher.Form method="post" style={{ display: "inline" }}>
                      <input type="hidden" name="action" value="reject" />
                      <input type="hidden" name="reviewId" value={review.id} />
                      <s-button
                        type="submit"
                        disabled={review.status === "rejected"}
                      >
                        {review.status === "rejected" ? "✓ Rejected" : "Reject"}
                      </s-button>
                    </fetcher.Form>

                    <s-button variant="tertiary" onClick={() => startReply(review)}>
                      {review.reply ? "Edit Reply" : "Reply"}
                    </s-button>

                    <fetcher.Form method="post" style={{ display: "inline" }} onSubmit={(e) => {
                      if (!confirm("Delete this review?")) e.preventDefault();
                    }}>
                      <input type="hidden" name="action" value="delete" />
                      <input type="hidden" name="reviewId" value={review.id} />
                      <s-button tone="critical" type="submit">
                        Delete
                      </s-button>
                    </fetcher.Form>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <div>
          <a href={`?page=${Math.max(page - 1, 1)}`} style={{ marginRight: 12 }}>Previous</a>
          <span>Page {page} / {Math.max(1, Math.ceil(total / perPage))}</span>
          <a href={`?page=${Math.min(page + 1, Math.max(1, Math.ceil(total / perPage)))}`} style={{ marginLeft: 12 }}>Next</a>
        </div>
      </div>
        </div>
      </div>
    </s-page>
  );
}
