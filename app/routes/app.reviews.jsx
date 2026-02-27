import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { useState, useCallback } from "react";
import prisma from "../db.server";
import cache from "../utils/cache.server";
import { updateProductReviewCount } from "../utils/metafields.server";
import { createReviewDiscountCode } from "../utils/discount.server";
import { sendDiscountRewardEmail } from "../utils/email.server";
import { generateReviewToken, buildReviewUrl } from "../utils/review-tokens.server";
import { deleteImageFromCloudinary } from "../utils/cloudinary.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
  const perPage = Math.min(Number(url.searchParams.get("perPage") || 20), 100);

  const statusParam  = url.searchParams.get("status")    || "all";
  const ratingParam  = url.searchParams.get("rating")    || "all";
  const typeParam    = url.searchParams.get("type")      || "all";
  const productParam = url.searchParams.get("productId") || "all";

  const where = { shop };
  if (statusParam  !== "all") where.status    = statusParam;
  if (ratingParam  !== "all") where.rating    = parseInt(ratingParam, 10);
  if (typeParam    !== "all") where.type      = typeParam;
  if (productParam !== "all") where.productId = productParam;

  const skip = (page - 1) * perPage;

  const [reviews, total, productsResponse, rawReviewedProducts] = await Promise.all([
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
    admin.graphql(`
      query {
        products(first: 100, sortKey: TITLE) {
          edges {
            node {
              id
              title
            }
          }
        }
      }
    `).then(r => r.json()).catch(() => null),
    prisma.review.findMany({
      where: { shop },
      distinct: ["productId"],
      select: { productId: true, productTitle: true },
      orderBy: { productTitle: "asc" },
    }),
  ]);

  const shopProducts = productsResponse?.data?.products?.edges?.map(e => ({
    id: e.node.id,
    title: e.node.title,
  })) || [];

  const reviewedProducts = rawReviewedProducts
    .filter(r => r.productId && r.productTitle)
    .map(r => ({ id: r.productId, title: r.productTitle }));

  return { reviews, page, perPage, total, shop, shopProducts, reviewedProducts };
}

async function invalidateCaches(shop) {
  try { await cache.delByPrefix(`app-proxy:reviews:${shop}:`); await cache.delByPrefix(`reviews:${shop}:`); } catch(e){}
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");
  const reviewId = formData.get("reviewId");

  if (actionType === "approve") {
    const review = await prisma.review.update({
      where: { id: reviewId, shop },
      data: { status: "approved" },
      select: { productId: true, customerEmail: true, customerName: true },
    });
    await invalidateCaches(shop);
    if (review?.productId) updateProductReviewCount(shop, review.productId).catch(() => {});

    const shopSettings = await prisma.shopSettings.findUnique({ where: { shop } });
    if (shopSettings?.reviewDiscountEnabled && review?.customerEmail) {
      const discountCode = await createReviewDiscountCode(shop, shopSettings.reviewDiscountPercentage, review.customerName);
      if (discountCode) {
        sendDiscountRewardEmail({
          to: review.customerEmail,
          customerName: review.customerName,
          shopName: shop.replace(".myshopify.com", ""),
          discountCode,
          discountPercentage: shopSettings.reviewDiscountPercentage,
        }).catch((err) => console.error("Discount email error:", err));
      }
    }
  } else if (actionType === "reject") {
    const review = await prisma.review.update({
      where: { id: reviewId, shop },
      data: { status: "rejected" },
      select: { productId: true },
    });
    await invalidateCaches(shop);
    if (review?.productId) updateProductReviewCount(shop, review.productId).catch(() => {});
  } else if (actionType === "delete") {
    const reviewToDelete = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { productId: true },
    });
    const images = await prisma.reviewImage.findMany({ where: { reviewId } });
    for (const img of images) {
      if (img.cloudinaryPublicId) {
        try { await deleteImageFromCloudinary(img.cloudinaryPublicId); }
        catch (err) { console.error("Failed to delete image from Cloudinary:", err?.message || err); }
      }
    }
    await prisma.review.delete({ where: { id: reviewId, shop } });
    await invalidateCaches(shop);
    if (reviewToDelete?.productId) updateProductReviewCount(shop, reviewToDelete.productId).catch(() => {});
  } else if (actionType === "reply") {
    const reply = formData.get("reply");
    await prisma.review.update({
      where: { id: reviewId, shop },
      data: { reply: reply || null, repliedAt: reply ? new Date() : null },
    });
    await invalidateCaches(shop);
  } else if (actionType === "requestReview") {
    const productId = formData.get("productId");
    const productTitle = formData.get("productTitle");
    const customerEmail = formData.get("customerEmail");
    const customerName = formData.get("customerName");

    if (!productId || !productTitle || !customerEmail || !customerName) {
      return { success: false, error: "All fields are required." };
    }

    const { token } = await generateReviewToken({ shop, productId, productTitle, customerEmail, customerName });
    const reviewUrls = {};
    for (let i = 1; i <= 5; i++) reviewUrls[i] = buildReviewUrl(shop, token, i);

    return { success: true, reviewToken: { token, reviewUrl: buildReviewUrl(shop, token), reviewUrls } };
  } else if (actionType === "toggleImage") {
    const imageId = formData.get("imageId");
    const approved = formData.get("approved") === "true";
    await prisma.reviewImage.update({
      where: { id: imageId },
      data: { status: approved ? "approved" : "rejected" },
    });
    await invalidateCaches(shop);
  } else if (actionType === "bulkApprove" || actionType === "bulkReject") {
    const ids = JSON.parse(formData.get("reviewIds") || "[]");
    if (ids.length === 0) return { success: false, error: "No reviews selected." };

    const newStatus = actionType === "bulkApprove" ? "approved" : "rejected";

    // Fetch reviews before updating (for metafields + discount emails)
    const reviewsBefore = await prisma.review.findMany({
      where: { id: { in: ids }, shop },
      select: { id: true, productId: true, customerEmail: true, customerName: true, status: true },
    });

    await prisma.review.updateMany({
      where: { id: { in: ids }, shop },
      data: { status: newStatus },
    });

    await invalidateCaches(shop);

    // Update metafields for affected products
    const affectedProductIds = [...new Set(reviewsBefore.filter(r => r.productId).map(r => r.productId))];
    for (const pid of affectedProductIds) {
      updateProductReviewCount(shop, pid).catch(() => {});
    }

    // Send discount emails for newly approved reviews (if enabled)
    if (actionType === "bulkApprove") {
      const shopSettings = await prisma.shopSettings.findUnique({ where: { shop } });
      if (shopSettings?.reviewDiscountEnabled) {
        for (const review of reviewsBefore) {
          if (review.status !== "approved" && review.customerEmail) {
            createReviewDiscountCode(shop, shopSettings.reviewDiscountPercentage, review.customerName)
              .then((code) => {
                if (code) {
                  sendDiscountRewardEmail({
                    to: review.customerEmail,
                    customerName: review.customerName,
                    shopName: shop.replace(".myshopify.com", ""),
                    discountCode: code,
                    discountPercentage: shopSettings.reviewDiscountPercentage,
                  }).catch((err) => console.error("Discount email error:", err));
                }
              })
              .catch((err) => console.error("Discount creation error:", err));
          }
        }
      }
    }

    return { success: true, bulkCount: reviewsBefore.length };
  } else if (actionType === "bulkDelete") {
    const ids = JSON.parse(formData.get("reviewIds") || "[]");
    if (ids.length === 0) return { success: false, error: "No reviews selected." };

    // Fetch reviews + images before deleting
    const reviewsToDelete = await prisma.review.findMany({
      where: { id: { in: ids }, shop },
      select: { id: true, productId: true, images: { select: { cloudinaryPublicId: true } } },
    });

    // Delete images from Cloudinary
    for (const review of reviewsToDelete) {
      for (const img of review.images) {
        if (img.cloudinaryPublicId) {
          try { await deleteImageFromCloudinary(img.cloudinaryPublicId); }
          catch (err) { console.error("Failed to delete image from Cloudinary:", err?.message || err); }
        }
      }
    }

    // Delete all reviews (cascade deletes images from DB)
    await prisma.review.deleteMany({ where: { id: { in: ids }, shop } });

    await invalidateCaches(shop);

    // Update metafields for affected products
    const affectedProductIds = [...new Set(reviewsToDelete.filter(r => r.productId).map(r => r.productId))];
    for (const pid of affectedProductIds) {
      updateProductReviewCount(shop, pid).catch(() => {});
    }

    return { success: true, bulkCount: reviewsToDelete.length };
  }

  return { success: true };
}

export default function ReviewsPage() {
  const { reviews, page, perPage, total, shop, shopProducts, reviewedProducts } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter  = searchParams.get("status")    || "all";
  const ratingFilter  = searchParams.get("rating")    || "all";
  const typeFilter    = searchParams.get("type")      || "all";
  const productFilter = searchParams.get("productId") || "all";

  const setFilter = useCallback((key, value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === "all") { next.delete(key); } else { next.set(key, value); }
      next.delete("page");
      return next;
    });
  }, [setSearchParams]);

  const buildPageUrl = useCallback((p) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(p));
    return "?" + next.toString();
  }, [searchParams]);

  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestResult, setRequestResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const fetcher = useFetcher();
  const bulkFetcher = useFetcher();
  const requestFetcher = useFetcher();

  const handleRequestSubmit = useCallback((e) => {
    e.preventDefault();
    setRequestResult(null);
    const fd = new FormData(e.target);
    fd.set("action", "requestReview");
    requestFetcher.submit(fd, { method: "post" });
  }, [requestFetcher]);

  const requestData = requestFetcher.data;
  if (requestData?.reviewToken && requestResult?.token !== requestData.reviewToken.token) {
    setRequestResult(requestData.reviewToken);
  }

  // Clear selection after bulk action completes
  const bulkData = bulkFetcher.data;
  if (bulkData?.success && selectedIds.size > 0 && bulkFetcher.state === "idle") {
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
    setDeleteConfirmText("");
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allIds = reviews.map(r => r.id);
    const allSelected = allIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }, [reviews, selectedIds]);

  const selectedReviews = reviews.filter(r => selectedIds.has(r.id));
  const selectedCount = selectedIds.size;

  const submitBulkAction = useCallback((action) => {
    const fd = new FormData();
    fd.set("action", action);
    fd.set("reviewIds", JSON.stringify([...selectedIds]));
    bulkFetcher.submit(fd, { method: "post" });
  }, [selectedIds, bulkFetcher]);

  const handleBulkApprove = useCallback(() => {
    if (confirm(`Approve ${selectedCount} review${selectedCount !== 1 ? "s" : ""}?`)) {
      submitBulkAction("bulkApprove");
    }
  }, [selectedCount, submitBulkAction]);

  const handleBulkReject = useCallback(() => {
    if (confirm(`Reject ${selectedCount} review${selectedCount !== 1 ? "s" : ""}?`)) {
      submitBulkAction("bulkReject");
    }
  }, [selectedCount, submitBulkAction]);

  const handleBulkDelete = useCallback(() => {
    setShowDeleteConfirm(true);
    setDeleteConfirmText("");
  }, []);

  const confirmBulkDelete = useCallback(() => {
    submitBulkAction("bulkDelete");
  }, [submitBulkAction]);

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

  // Status breakdown of selected reviews
  const selectedPending = selectedReviews.filter(r => r.status === "pending").length;
  const selectedApproved = selectedReviews.filter(r => r.status === "approved").length;
  const selectedRejected = selectedReviews.filter(r => r.status === "rejected").length;
  const selectedBreakdown = [
    selectedPending > 0 && `${selectedPending} pending`,
    selectedApproved > 0 && `${selectedApproved} approved`,
    selectedRejected > 0 && `${selectedRejected} rejected`,
  ].filter(Boolean).join(", ");

  const isBulkBusy = bulkFetcher.state !== "idle";
  const allFilteredSelected = reviews.length > 0 && reviews.every(r => selectedIds.has(r.id));
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <s-page heading="Reviews">
      {/* Request Review Section */}
      <s-box padding="base" borderWidth="base" borderRadius="base" style={{ marginBottom: "24px" }}>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" align="space-between">
            <s-text variant="headingSm">Request a Review</s-text>
            <s-button variant="tertiary" onClick={() => { setShowRequestForm(!showRequestForm); setRequestResult(null); }}>
              {showRequestForm ? "Close" : "Send Review Request"}
            </s-button>
          </s-stack>

          {showRequestForm && (
            <form onSubmit={handleRequestSubmit}>
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base">
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 500 }}>Customer Email</label>
                    <input name="customerEmail" type="email" required placeholder="customer@example.com"
                      style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 500 }}>Customer Name</label>
                    <input name="customerName" type="text" required placeholder="Jane Doe"
                      style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }} />
                  </div>
                </s-stack>
                <s-stack direction="inline" gap="base">
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 500 }}>Product</label>
                    {shopProducts.length > 0 ? (
                      <>
                        <select name="productId" required
                          onChange={(e) => {
                            const sel = shopProducts.find(p => p.id === e.target.value);
                            const titleInput = e.target.form.querySelector('[name="productTitle"]');
                            if (titleInput && sel) titleInput.value = sel.title;
                          }}
                          style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px" }}>
                          <option value="">Select a product...</option>
                          {shopProducts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                        <input name="productTitle" type="hidden" />
                      </>
                    ) : (
                      <>
                        <input name="productId" type="text" required placeholder="gid://shopify/Product/12345"
                          style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }} />
                        <div style={{ marginTop: "8px" }}>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 500 }}>Product Title</label>
                          <input name="productTitle" type="text" required placeholder="Product name"
                            style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }} />
                        </div>
                      </>
                    )}
                  </div>
                </s-stack>

                <s-button variant="primary" type="submit" disabled={requestFetcher.state !== "idle"}>
                  {requestFetcher.state !== "idle" ? "Generating..." : "Generate Review Link"}
                </s-button>

                {requestData?.error && (
                  <s-text tone="critical">{requestData.error}</s-text>
                )}

                {requestResult && (
                  <s-box padding="base" background="subdued" borderRadius="base">
                    <s-stack direction="block" gap="base">
                      <s-text variant="headingSm">Review link generated!</s-text>
                      <s-text tone="subdued">Share this link with the customer, or use the star-specific URLs in your email template.</s-text>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input type="text" readOnly value={requestResult.reviewUrl}
                          style={{ flex: 1, padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "13px", background: "#f9f9f9" }} />
                        <s-button variant="tertiary" onClick={() => copyToClipboard(requestResult.reviewUrl)}>
                          {copied ? "Copied!" : "Copy"}
                        </s-button>
                      </div>
                      <details>
                        <summary style={{ cursor: "pointer", fontSize: "13px", color: "#666" }}>Star-specific URLs (for email templates)</summary>
                        <div style={{ marginTop: "8px", fontSize: "13px" }}>
                          {[1,2,3,4,5].map(n => (
                            <div key={n} style={{ marginBottom: "4px" }}>
                              <span style={{ color: "#f5a623" }}>{"★".repeat(n)}{"☆".repeat(5-n)}</span>{" "}
                              <code style={{ fontSize: "12px", wordBreak: "break-all" }}>{requestResult.reviewUrls[n]}</code>
                            </div>
                          ))}
                        </div>
                      </details>
                    </s-stack>
                  </s-box>
                )}
              </s-stack>
            </form>
          )}
        </s-stack>
      </s-box>

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
                    <input type="radio" name="status" checked={statusFilter === "all"} onChange={() => setFilter("status", "all")} />
                    <span>All</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="status" checked={statusFilter === "pending"} onChange={() => setFilter("status", "pending")} />
                    <span>Pending</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="status" checked={statusFilter === "approved"} onChange={() => setFilter("status", "approved")} />
                    <span>Approved</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="status" checked={statusFilter === "rejected"} onChange={() => setFilter("status", "rejected")} />
                    <span>Rejected</span>
                  </label>
                </s-stack>
              </s-stack>

              <s-divider />

              {/* Type Filter */}
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Type</s-text>
                <s-stack direction="block" gap="tight">
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="type" checked={typeFilter === "all"} onChange={() => setFilter("type", "all")} />
                    <span>All</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="type" checked={typeFilter === "product"} onChange={() => setFilter("type", "product")} />
                    <span>Product</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="type" checked={typeFilter === "company"} onChange={() => {
                      setSearchParams(prev => {
                        const next = new URLSearchParams(prev);
                        next.set("type", "company");
                        next.delete("productId");
                        next.delete("page");
                        return next;
                      });
                    }} />
                    <span>Store</span>
                  </label>
                </s-stack>
              </s-stack>

              <s-divider />

              {/* Rating Filter */}
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Rating</s-text>
                <s-stack direction="block" gap="tight">
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="radio" name="rating" checked={ratingFilter === "all"} onChange={() => setFilter("rating", "all")} />
                    <span>All ratings</span>
                  </label>
                  {[5, 4, 3, 2, 1].map((stars) => (
                    <label key={stars} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input type="radio" name="rating" checked={ratingFilter === String(stars)} onChange={() => setFilter("rating", String(stars))} />
                      <span style={{ color: "#f5a623" }}>{starRating(stars)}</span>
                    </label>
                  ))}
                </s-stack>
              </s-stack>

              {reviewedProducts.length > 0 && (
                <>
                  <s-divider />

                  {/* Product Filter */}
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingSm">Product</s-text>
                    <select
                      value={productFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchParams(prev => {
                          const next = new URLSearchParams(prev);
                          if (val === "all") {
                            next.delete("productId");
                          } else {
                            next.set("productId", val);
                            next.set("type", "product");
                          }
                          next.delete("page");
                          return next;
                        });
                      }}
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        fontSize: "14px"
                      }}
                    >
                      <option value="all">All products</option>
                      {reviewedProducts.map((product) => (
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
        <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
          {/* Select all + count row */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            {reviews.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <span style={{ fontSize: "13px", color: "#666" }}>Select all</span>
              </label>
            )}
            <s-text tone="subdued">
              {total} review{total !== 1 ? "s" : ""}{reviews.length < total ? ` — showing ${reviews.length}` : ""}
            </s-text>
          </div>

          {/* Bulk Action Bar */}
          {selectedCount >= 2 && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued" style={{ marginBottom: "16px" }}>
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base" align="space-between">
                  <s-text variant="headingSm">
                    {selectedCount} review{selectedCount !== 1 ? "s" : ""} selected
                    <span style={{ fontWeight: "normal", color: "#666", fontSize: "13px" }}> ({selectedBreakdown})</span>
                  </s-text>
                  <s-button variant="tertiary" onClick={() => { setSelectedIds(new Set()); setShowDeleteConfirm(false); }}>
                    Clear selection
                  </s-button>
                </s-stack>

                {showDeleteConfirm ? (
                  <s-box padding="base" borderWidth="base" borderRadius="base" style={{ background: "#fff5f5", borderColor: "#e74c3c" }}>
                    <s-stack direction="block" gap="base">
                      <s-text>
                        This will permanently delete {selectedCount} review{selectedCount !== 1 ? "s" : ""} and their images. This cannot be undone.
                      </s-text>
                      <s-stack direction="inline" gap="base" align="start">
                        <div>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 500 }}>
                            Type <strong>{selectedCount}</strong> to confirm
                          </label>
                          <input
                            type="text"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder={String(selectedCount)}
                            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", width: "100px" }}
                            autoFocus
                          />
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", paddingTop: "20px" }}>
                          <s-button
                            tone="critical"
                            disabled={deleteConfirmText !== String(selectedCount) || isBulkBusy}
                            onClick={confirmBulkDelete}
                          >
                            {isBulkBusy ? "Deleting..." : `Delete ${selectedCount} reviews`}
                          </s-button>
                          <s-button variant="tertiary" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}>
                            Cancel
                          </s-button>
                        </div>
                      </s-stack>
                    </s-stack>
                  </s-box>
                ) : (
                  <s-stack direction="inline" gap="base">
                    <s-button variant="primary" onClick={handleBulkApprove} disabled={isBulkBusy}>
                      {isBulkBusy ? "Working..." : `Approve ${selectedCount}`}
                    </s-button>
                    <s-button onClick={handleBulkReject} disabled={isBulkBusy}>
                      {isBulkBusy ? "Working..." : `Reject ${selectedCount}`}
                    </s-button>
                    <s-button tone="critical" onClick={handleBulkDelete} disabled={isBulkBusy}>
                      Delete {selectedCount}
                    </s-button>
                  </s-stack>
                )}
              </s-stack>
            </s-box>
          )}

      <s-section>
        {reviews.length === 0 ? (
          <s-box padding="loose" background="subdued" borderRadius="base">
            <s-text tone="subdued">No reviews found.</s-text>
          </s-box>
        ) : (
          <s-stack direction="block" gap="base">
            {reviews.map((review) => (
              <s-box
                key={review.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                style={selectedIds.has(review.id) ? { outline: "2px solid #2c6ecb", outlineOffset: "-2px" } : undefined}
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" align="space-between">
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(review.id)}
                        onChange={() => toggleSelect(review.id)}
                        style={{ width: "16px", height: "16px", cursor: "pointer", flexShrink: 0 }}
                      />
                      <s-text variant="headingSm">{review.title}</s-text>
                    </div>
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
          <a href={buildPageUrl(Math.max(page - 1, 1))} style={{ marginRight: 12 }}>Previous</a>
          <span>Page {page} / {totalPages}</span>
          <a href={buildPageUrl(Math.min(page + 1, totalPages))} style={{ marginLeft: 12 }}>Next</a>
        </div>
      </div>
        </div>
      </div>
    </s-page>
  );
}
