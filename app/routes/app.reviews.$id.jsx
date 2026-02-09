import { redirect, useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

  if (actionType === "approve") {
    await prisma.review.update({
      where: { id, shop },
      data: { status: "approved" },
    });
  } else if (actionType === "reject") {
    await prisma.review.update({
      where: { id, shop },
      data: { status: "rejected" },
    });
  } else if (actionType === "delete") {
    await prisma.review.delete({
      where: { id, shop },
    });
    return redirect("/app/reviews");
  }

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
