import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopPlanFromDb, checkReviewCap, checkEmailCap, checkDiscountCap, isAllowlisted } from "../utils/billing.server";

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

  // Plan limit alerts (uses cached plan from DB — no billing API call)
  let planAlerts = null;
  if (!isAllowlisted(shop)) {
    const plan = await getShopPlanFromDb(shop);
    const [reviewCap, emailCap, discountCap] = await Promise.all([
      checkReviewCap(shop, plan),
      checkEmailCap(shop, plan),
      checkDiscountCap(shop, plan),
    ]);

    function alertLevel(cap) {
      if (cap.limit === null) return null;
      const pct = (cap.count / cap.limit) * 100;
      if (pct >= 100) return "critical";
      if (pct >= 80) return "warning";
      return null;
    }

    planAlerts = {
      reviews: { level: alertLevel(reviewCap), count: reviewCap.count, limit: reviewCap.limit },
      emails: { level: alertLevel(emailCap), count: emailCap.count, limit: emailCap.limit },
      discounts: { level: alertLevel(discountCap), count: discountCap.count, limit: discountCap.limit },
    };
  }

  return {
    stats: { total, pending, approved, rejected, avgRating },
    recentReviews,
    planAlerts,
  };
};

export default function Index() {
  const { stats, recentReviews, planAlerts } = useLoaderData();
  const navigate = useNavigate();

  const starRating = (rating) => "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));

  // Determine highest severity across all metrics
  const hasCritical = planAlerts && Object.values(planAlerts).some((a) => a.level === "critical");
  const hasWarning = planAlerts && !hasCritical && Object.values(planAlerts).some((a) => a.level === "warning");

  return (
    <s-page heading="Reviews Dashboard">
      <s-button slot="primary-action" onClick={() => navigate("/app/reviews")}>
        View All Reviews
      </s-button>
      <s-button slot="secondary-actions" onClick={() => navigate("/app/analytics")}>
        Analytics
      </s-button>

      {hasCritical && (
        <s-section>
          <s-banner heading="Plan limit reached — action required" tone="critical">
            <s-stack direction="block" gap="tight">
              {planAlerts.reviews.level === "critical" && (
                <s-paragraph>
                  <strong>Review storage full ({planAlerts.reviews.count}/{planAlerts.reviews.limit}).</strong> New reviews from customers are currently being rejected.
                </s-paragraph>
              )}
              {planAlerts.emails.level === "critical" && (
                <s-paragraph>
                  <strong>Email limit reached ({planAlerts.emails.count}/{planAlerts.emails.limit} this month).</strong> Shopify Flow is no longer sending review request emails until next month.
                </s-paragraph>
              )}
              {planAlerts.discounts.level === "critical" && (
                <s-paragraph>
                  <strong>Discount code limit reached ({planAlerts.discounts.count}/{planAlerts.discounts.limit} this month).</strong> Customers who write reviews are not receiving their reward codes.
                </s-paragraph>
              )}
            </s-stack>
            <s-button onClick={() => navigate("/app/billing")}>Upgrade plan</s-button>
          </s-banner>
        </s-section>
      )}

      {hasWarning && (
        <s-section>
          <s-banner heading="Approaching plan limits" tone="warning">
            <s-stack direction="block" gap="tight">
              {planAlerts.reviews.level === "warning" && (
                <s-paragraph>
                  Review storage: <strong>{planAlerts.reviews.count} of {planAlerts.reviews.limit} used.</strong> When full, new customer reviews will be rejected.
                </s-paragraph>
              )}
              {planAlerts.emails.level === "warning" && (
                <s-paragraph>
                  Email requests: <strong>{planAlerts.emails.count} of {planAlerts.emails.limit} sent this month.</strong> Flow will stop sending review emails when the limit is reached.
                </s-paragraph>
              )}
              {planAlerts.discounts.level === "warning" && (
                <s-paragraph>
                  Discount codes: <strong>{planAlerts.discounts.count} of {planAlerts.discounts.limit} used this month.</strong> Customers will stop receiving reward codes when the limit is reached.
                </s-paragraph>
              )}
            </s-stack>
            <s-button variant="secondary" onClick={() => navigate("/app/billing")}>View plan &amp; usage</s-button>
          </s-banner>
        </s-section>
      )}

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
          <s-banner heading="Reviews pending approval" tone="warning">
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
            <s-text tone="neutral">No reviews yet. Reviews from your customers will appear here.</s-text>
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
                  <s-text tone="neutral">
                    by {review.customerName} • {new Date(review.createdAt).toLocaleDateString()}
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Import Reviews">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Migrating from Yotpo or Judge.me? Import your existing reviews from a CSV export.
          </s-paragraph>
          <s-button onClick={() => navigate("/app/import")}>Import from CSV</s-button>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Automated Review Emails">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Automatically email customers 7 days after their order is fulfilled, asking them to review the products they purchased. No manual work needed.
          </s-paragraph>
          <s-banner heading="Setup in Shopify Flow" tone="info">
            <s-numbered-list>
              <s-list-item>Open Shopify Flow and create a new workflow. </s-list-item>
              <s-list-item>Select the <s-text fontWeight="bold">Order fulfilled</s-text> trigger. </s-list-item>
              <s-list-item>Add a <s-text fontWeight="bold">Wait</s-text> step (e.g. 7 days). </s-list-item>
              <s-list-item>Add the <s-text fontWeight="bold">Send review request email</s-text> action. </s-list-item>
              <s-list-item>Turn on the workflow. </s-list-item>
            </s-numbered-list>
            <s-button slot="secondary-actions" variant="secondary" href="shopify:admin/apps/flow">Open Shopify Flow</s-button>
          </s-banner>
          <s-paragraph>
            <s-text tone="neutral">Shopify Flow is free and included with all Shopify plans. Each email includes secure, single-use review links — no customer login required.</s-text>
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
