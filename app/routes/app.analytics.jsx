import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    approvedCount,
    pendingCount,
    avgResult,
    ratingDist,
    verifiedCount,
    thisMonthCount,
    prevMonthCount,
    monthlyRaw,
    productStats,
    tokenTotal,
    tokenUsed,
    tokenTimings,
  ] = await Promise.all([
    prisma.review.count({ where: { shop, status: "approved" } }),
    prisma.review.count({ where: { shop, status: "pending" } }),
    prisma.review.aggregate({ where: { shop, status: "approved" }, _avg: { rating: true } }),
    prisma.review.groupBy({ by: ["rating"], where: { shop, status: "approved" }, _count: true }),
    prisma.review.count({ where: { shop, status: "approved", orderId: { not: null } } }),
    prisma.review.count({ where: { shop, createdAt: { gte: startOfMonth } } }),
    prisma.review.count({ where: { shop, createdAt: { gte: startOfPrevMonth, lt: startOfMonth } } }),
    prisma.review.findMany({
      where: { shop, status: "approved", createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true, rating: true },
    }),
    prisma.review.groupBy({
      by: ["productId", "productTitle"],
      where: { shop, status: "approved", type: "product" },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    prisma.reviewRequestToken.count({ where: { shop } }),
    prisma.reviewRequestToken.count({ where: { shop, usedAt: { not: null } } }),
    prisma.reviewRequestToken.findMany({
      where: { shop, usedAt: { not: null } },
      select: { createdAt: true, usedAt: true },
    }),
  ]);

  // Rating distribution as object { 1: count, 2: count, ... 5: count }
  const ratingDistMap = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratingDist.forEach((r) => { ratingDistMap[r.rating] = r._count; });

  // Monthly trend: group reviews by YYYY-MM in JS
  const monthlyMap = {};
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[key] = { count: 0, totalRating: 0 };
  }
  monthlyRaw.forEach((r) => {
    const d = new Date(r.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap[key]) {
      monthlyMap[key].count++;
      monthlyMap[key].totalRating += r.rating;
    }
  });
  const monthlyTrend = Object.entries(monthlyMap).map(([key, val]) => ({
    month: key,
    count: val.count,
    avgRating: val.count > 0 ? val.totalRating / val.count : 0,
  }));

  // Product insights: filter for 2+ reviews, sort for lowest and most reviewed
  const productsWithMultiple = productStats
    .filter((p) => p._count._all >= 2)
    .map((p) => ({
      productId: p.productId,
      productTitle: p.productTitle || "Unknown Product",
      count: p._count._all,
      avgRating: Number((p._avg.rating || 0).toFixed(1)),
    }));

  const lowestRated = [...productsWithMultiple]
    .sort((a, b) => a.avgRating - b.avgRating)
    .slice(0, 5);

  const mostReviewed = [...productsWithMultiple]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Low-rated alerts: products with avg < 3.0 and recent reviews
  const recentLowRated = productStats
    .filter((p) => p._count._all >= 3 && (p._avg.rating || 0) < 3.0)
    .map((p) => ({
      productId: p.productId,
      productTitle: p.productTitle || "Unknown Product",
      count: p._count._all,
      avgRating: Number((p._avg.rating || 0).toFixed(1)),
    }));

  // Token conversion stats
  let emailConversion = null;
  if (tokenTotal > 0) {
    const avgDaysToReview = tokenTimings.length > 0
      ? tokenTimings.reduce((sum, t) => {
          const diff = (new Date(t.usedAt) - new Date(t.createdAt)) / (1000 * 60 * 60 * 24);
          return sum + diff;
        }, 0) / tokenTimings.length
      : 0;

    emailConversion = {
      sent: tokenTotal,
      converted: tokenUsed,
      rate: Number(((tokenUsed / tokenTotal) * 100).toFixed(1)),
      avgDays: Number(avgDaysToReview.toFixed(1)),
    };
  }

  const avgRating = avgResult._avg.rating ? Number(avgResult._avg.rating.toFixed(1)) : 0;
  const verifiedPct = approvedCount > 0 ? Number(((verifiedCount / approvedCount) * 100).toFixed(0)) : 0;

  let monthChange = null;
  if (prevMonthCount > 0) {
    monthChange = Number((((thisMonthCount - prevMonthCount) / prevMonthCount) * 100).toFixed(0));
  }

  return {
    approvedCount,
    pendingCount,
    avgRating,
    ratingDistMap,
    verifiedPct,
    thisMonthCount,
    prevMonthCount,
    monthChange,
    monthlyTrend,
    lowestRated,
    mostReviewed,
    recentLowRated,
    emailConversion,
  };
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonth(key) {
  const [, m] = key.split("-");
  return MONTH_NAMES[parseInt(m, 10) - 1];
}

function ratingColor(avg) {
  if (avg >= 4) return "#2e7d32";
  if (avg >= 3) return "#f57c00";
  return "#c62828";
}

const STAR_COLORS = {
  5: "#2e7d32",
  4: "#558b2f",
  3: "#f9a825",
  2: "#ef6c00",
  1: "#c62828",
};

export default function AnalyticsPage() {
  const {
    approvedCount, pendingCount, avgRating, ratingDistMap,
    verifiedPct, thisMonthCount, prevMonthCount, monthChange,
    monthlyTrend, lowestRated, mostReviewed, recentLowRated,
    emailConversion,
  } = useLoaderData();
  const navigate = useNavigate();

  const starRating = (r) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));
  const maxMonthly = Math.max(...monthlyTrend.map((m) => m.count), 1);
  const maxRatingCount = Math.max(...Object.values(ratingDistMap), 1);

  return (
    <s-page heading="Review Analytics">
      <s-button slot="primary-action" onClick={() => navigate("/app/reviews")}>
        View All Reviews
      </s-button>

      {/* Quick Stats */}
      <s-section heading="Overview">
        <s-stack direction="inline" gap="loose">
          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="140px"
            onClick={() => navigate("/app/reviews")} style={{ cursor: "pointer" }}>
            <s-stack direction="block" gap="tight">
              <s-text variant="headingLg" tone="warning">{pendingCount}</s-text>
              <s-text>Pending Review</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="140px">
            <s-stack direction="block" gap="tight">
              <s-text variant="headingLg">{avgRating} {starRating(avgRating)}</s-text>
              <s-text>Average Rating</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="140px">
            <s-stack direction="block" gap="tight">
              <s-text variant="headingLg">
                {thisMonthCount}
                {monthChange !== null && (
                  <span style={{ fontSize: "0.7em", marginLeft: "0.5rem", color: monthChange >= 0 ? "#2e7d32" : "#c62828" }}>
                    {monthChange >= 0 ? "▲" : "▼"} {Math.abs(monthChange)}%
                  </span>
                )}
              </s-text>
              <s-text>Reviews This Month {prevMonthCount > 0 ? `(vs ${prevMonthCount} last)` : ""}</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="140px">
            <s-stack direction="block" gap="tight">
              <s-text variant="headingLg">{verifiedPct}%</s-text>
              <s-text>Verified Purchases</s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* Alerts */}
      {recentLowRated.length > 0 && (
        <s-section heading="Attention Needed">
          {recentLowRated.map((p) => (
            <s-banner key={p.productId} heading={p.productTitle} tone="warning">
              <s-paragraph>
                Average rating {p.avgRating} {starRating(p.avgRating)} across {p.count} reviews.
              </s-paragraph>
            </s-banner>
          ))}
        </s-section>
      )}

      {/* Rating Distribution */}
      <s-section heading="Rating Distribution">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingDistMap[star] || 0;
              const pct = approvedCount > 0 ? ((count / approvedCount) * 100).toFixed(0) : 0;
              return (
                <div key={star} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ width: "2.5rem", textAlign: "right", fontSize: "0.9rem", color: "#f5a623" }}>
                    {star} ★
                  </span>
                  <div style={{ flex: 1, background: "#f0f0f0", borderRadius: "4px", height: "22px", overflow: "hidden" }}>
                    <div style={{
                      width: `${maxRatingCount > 0 ? (count / maxRatingCount) * 100 : 0}%`,
                      height: "100%",
                      background: STAR_COLORS[star],
                      borderRadius: "4px",
                      minWidth: count > 0 ? "4px" : 0,
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                  <span style={{ width: "4rem", fontSize: "0.85rem", color: "#666" }}>
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </s-box>
      </s-section>

      {/* Monthly Trend */}
      <s-section heading="Reviews Over Time (12 Months)">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <div style={{ display: "flex", alignItems: "flex-end", gap: "0.35rem", height: "160px" }}>
            {monthlyTrend.map((m) => (
              <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "100%" }}>
                  {m.count > 0 && (
                    <span style={{ textAlign: "center", fontSize: "0.7rem", color: "#666", marginBottom: "2px" }}>
                      {m.count}
                    </span>
                  )}
                  <div style={{
                    width: "100%",
                    height: `${maxMonthly > 0 ? (m.count / maxMonthly) * 100 : 0}%`,
                    minHeight: m.count > 0 ? "4px" : 0,
                    background: m.count > 0 ? ratingColor(m.avgRating) : "#e0e0e0",
                    borderRadius: "3px 3px 0 0",
                    transition: "height 0.3s ease",
                  }} />
                </div>
                <span style={{ fontSize: "0.65rem", color: "#888", marginTop: "4px" }}>
                  {formatMonth(m.month)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "0.75rem", fontSize: "0.75rem", color: "#888" }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#2e7d32", borderRadius: 2, marginRight: 4 }} />Avg 4+★</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#f57c00", borderRadius: 2, marginRight: 4 }} />Avg 3-4★</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#c62828", borderRadius: 2, marginRight: 4 }} />Avg &lt;3★</span>
          </div>
        </s-box>
      </s-section>

      {/* Email Conversion */}
      {emailConversion && (
        <s-section heading="Review Request Emails">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" gap="loose">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingLg">{emailConversion.sent}</s-text>
                <s-text>Emails Sent</s-text>
              </s-stack>
              <s-stack direction="block" gap="tight">
                <s-text variant="headingLg">{emailConversion.converted}</s-text>
                <s-text>Reviews Received</s-text>
              </s-stack>
              <s-stack direction="block" gap="tight">
                <s-text variant="headingLg" tone={emailConversion.rate >= 20 ? "success" : emailConversion.rate >= 10 ? "warning" : "critical"}>
                  {emailConversion.rate}%
                </s-text>
                <s-text>Conversion Rate</s-text>
              </s-stack>
              <s-stack direction="block" gap="tight">
                <s-text variant="headingLg">{emailConversion.avgDays} days</s-text>
                <s-text>Avg Time to Review</s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-section>
      )}

      {/* Product Insights - Sidebar */}
      {lowestRated.length > 0 && (
        <s-section slot="aside" heading="Lowest Rated Products">
          <s-stack direction="block" gap="base">
            {lowestRated.map((p) => (
              <s-box key={p.productId} padding="tight" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <s-text variant="bodySm" fontWeight="bold">{p.productTitle}</s-text>
                  <s-text tone={p.avgRating < 3 ? "critical" : "warning"}>
                    {p.avgRating} {starRating(p.avgRating)} ({p.count} reviews)
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}

      {mostReviewed.length > 0 && (
        <s-section slot="aside" heading="Most Reviewed Products">
          <s-stack direction="block" gap="base">
            {mostReviewed.map((p) => (
              <s-box key={p.productId} padding="tight" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <s-text variant="bodySm" fontWeight="bold">{p.productTitle}</s-text>
                  <s-text>
                    {p.avgRating} {starRating(p.avgRating)} ({p.count} reviews)
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}
