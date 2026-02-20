import { redirect, useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { updateProductReviewCount } from "../utils/metafields.server";
import { createReviewDiscountCode } from "../utils/discount.server";
import { sendDiscountRewardEmail } from "../utils/email.server";

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  const review = await prisma.review.findFirst({
    where: { id, shop },
    include: { images: true },
  });

  if (!review) {
    throw new Response("Review not found", { status: 404 });
  }

  return { review };
}

export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;
  const formData = await request.formData();
  const actionType = formData.get("action");

  let productId = null;

  if (actionType === "approve") {
    const review = await prisma.review.update({
      where: { id, shop },
      data: { status: "approved" },
      select: { productId: true, customerEmail: true, customerName: true },
    });
    productId = review?.productId;

    // Generate and email discount code if enabled
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
      where: { id, shop },
      data: { status: "rejected" },
      select: { productId: true },
    });
    productId = review?.productId;
  } else if (actionType === "delete") {
    const review = await prisma.review.findUnique({ where: { id }, select: { productId: true } });
    productId = review?.productId;
    await prisma.review.delete({
      where: { id, shop },
    });
    if (productId) updateProductReviewCount(shop, productId).catch(() => {});
    return redirect("/app/reviews");
  }

  if (productId) updateProductReviewCount(shop, productId).catch(() => {});
  return redirect(`/app/reviews/${id}`);
}

export default function ReviewDetailPage() {
  const { review } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const starRating = (rating) => "★".repeat(rating) + "☆".repeat(5 - rating);

  const statusTone = (status) => {
    if (status === "approved") return "success";
    if (status === "pending") return "warning";
    if (status === "rejected") return "critical";
    return "default";
  };

  const isPending = review.status === "pending";
  const isApproved = review.status === "approved";
  const isRejected = review.status === "rejected";

  return (
    <s-page heading={review.title}>
      <s-section>
        <s-box padding="loose" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingMd">{review.customerName}</s-text>
                <s-text tone="subdued">{review.customerEmail}</s-text>
              </s-stack>
              <s-stack direction="block" gap="tight" align="end">
                <s-text variant="headingLg" tone="warning">{starRating(review.rating)}</s-text>
                <s-badge tone={statusTone(review.status)}>{review.status}</s-badge>
              </s-stack>
            </s-stack>

            <s-divider />

            <s-stack direction="inline" gap="base">
              <s-badge>{review.type === "product" ? "Product Review" : "Company Review"}</s-badge>
              {review.productTitle && <s-text tone="subdued">{review.productTitle}</s-text>}
              {review.orderId && <s-badge tone="success">Verified Purchase</s-badge>}
            </s-stack>

            <s-divider />

            <s-stack direction="block" gap="tight">
              <s-text variant="headingSm">Review Content</s-text>
              <s-text>{review.content}</s-text>
            </s-stack>

            <s-divider />

            <s-text tone="subdued">
              Submitted on {new Date(review.createdAt).toLocaleString()}
            </s-text>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Actions">
        <s-stack direction="inline" gap="base">
          <fetcher.Form method="post">
            <input type="hidden" name="action" value="approve" />
            <s-button variant="primary" type="submit" disabled={isApproved}>
              {isApproved ? "✓ Approved" : "Approve"}
            </s-button>
          </fetcher.Form>

          <fetcher.Form method="post">
            <input type="hidden" name="action" value="reject" />
            <s-button type="submit" disabled={isRejected}>
              {isRejected ? "✓ Rejected" : "Reject"}
            </s-button>
          </fetcher.Form>

          <fetcher.Form method="post" onSubmit={(e) => {
            if (!confirm("Are you sure you want to delete this review?")) {
              e.preventDefault();
            }
          }}>
            <input type="hidden" name="action" value="delete" />
            <s-button tone="critical" type="submit">
              Delete
            </s-button>
          </fetcher.Form>
        </s-stack>
      </s-section>

      <s-section>
        <s-button variant="tertiary" onClick={() => navigate("/app/reviews")}>
          ← Back to Reviews
        </s-button>
      </s-section>
    </s-page>
  );
}
