import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get review statistics
  const [total, pending, approved, rejected] = await Promise.all([
    prisma.review.count({ where: { shop } }),
    prisma.review.count({ where: { shop, status: "pending" } }),
    prisma.review.count({ where: { shop, status: "approved" } }),
    prisma.review.count({ where: { shop, status: "rejected" } }),
  ]);

  // Get recent reviews
  const recentReviews = await prisma.review.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Calculate average rating
  const approvedReviews = await prisma.review.findMany({
    where: { shop, status: "approved" },
    select: { rating: true },
  });

  const avgRating = approvedReviews.length > 0
    ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length
    : 0;

  return {
    stats: { total, pending, approved, rejected, avgRating },
    recentReviews,
  };
};

export default function Index() {
  const { stats, recentReviews } = useLoaderData();
  const navigate = useNavigate();

  const starRating = (rating) => "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));

  return (
    <s-page heading="Reviews Dashboard">
      <s-button slot="primary-action" onClick={() => navigate("/app/reviews")}>
        View All Reviews
      </s-button>

      <s-section heading="Overview">
        <s-stack direction="inline" gap="loose">
          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="150px">
            <s-stack direction="block" gap="tight">
              <s-text variant="headingLg">{stats.total}</s-text>
              <s-text>Total Reviews</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="150px" background="subdued">
            <s-stack direction="block" gap="tight">
              <s-text variant="headingLg" tone="warning">{stats.pending}</s-text>
              <s-text>Pending Approval</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="150px">
            <s-stack direction="block" gap="tight">
              <s-text variant="headingLg" tone="success">{stats.approved}</s-text>
              <s-text>Approved</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="150px">
            <s-stack direction="block" gap="tight">
              <s-text variant="headingLg">{stats.avgRating.toFixed(1)} {starRating(stats.avgRating)}</s-text>
              <s-text>Average Rating</s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {stats.pending > 0 && (
        <s-section>
          <s-banner title="Reviews pending approval" tone="warning">
            <s-paragraph>
              You have {stats.pending} review{stats.pending !== 1 ? "s" : ""} waiting for moderation.
            </s-paragraph>
            <s-button onClick={() => navigate("/app/reviews")}>Review now</s-button>
          </s-banner>
        </s-section>
      )}

      <s-section heading="Recent Reviews">
        {recentReviews.length === 0 ? (
          <s-box padding="loose" background="subdued" borderRadius="base">
            <s-text tone="subdued">No reviews yet. Reviews from your customers will appear here.</s-text>
          </s-box>
        ) : (
          <s-stack direction="block" gap="base">
            {recentReviews.map((review) => (
              <s-box
                key={review.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                onClick={() => navigate(`/app/reviews/${review.id}`)}
                style={{ cursor: "pointer" }}
              >
                <s-stack direction="block" gap="tight">
                  <s-stack direction="inline" gap="base" align="space-between">
                    <s-text variant="headingSm">{review.title}</s-text>
                    <s-badge tone={review.status === "approved" ? "success" : review.status === "pending" ? "warning" : "critical"}>
                      {review.status}
                    </s-badge>
                  </s-stack>
                  <s-text tone="warning">{starRating(review.rating)}</s-text>
                  <s-text tone="subdued">
                    by {review.customerName} • {new Date(review.createdAt).toLocaleDateString()}
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Quick Setup">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            To display reviews on your storefront, add the <s-text variant="bodyMd" fontWeight="bold">Product Reviews</s-text> block to your theme.
          </s-paragraph>
          <s-numbered-list>
            <s-list-item>Go to Online Store → Themes</s-list-item>
            <s-list-item>Click Customize</s-list-item>
            <s-list-item>Navigate to a product page</s-list-item>
            <s-list-item>Add the "Product Reviews" app block</s-list-item>
          </s-numbered-list>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Review Types">
        <s-stack direction="block" gap="tight">
          <s-paragraph>
            <s-text fontWeight="bold">Product Reviews:</s-text> Displayed on product pages. Customers can submit reviews after purchase.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Company Reviews:</s-text> General reviews about your store, displayed wherever you place the block.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
