import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { syncShopPlan, getPlanLimits, PLAN_NAMES, FREE_PLAN, isAllowlisted, checkReviewCap, checkEmailCap, checkDiscountCap } from "../utils/billing.server";

// Plan name strings duplicated here for client-side use — must not come from .server module
const PLAN_STARTER = "Starter";
const PLAN_PRO = "Pro";
const PLAN_FREE = "free";

const IS_TEST = process.env.NODE_ENV !== "production";

export async function loader({ request }) {
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;
  const allowlisted = isAllowlisted(shop);
  const plan = await syncShopPlan(billing, shop);
  const limits = getPlanLimits(plan);

  let activeSubscription = null;
  if (!allowlisted && plan !== FREE_PLAN) {
    try {
      const { appSubscriptions } = await billing.check({
        plans: [PLAN_NAMES.STARTER, PLAN_NAMES.PRO],
      });
      activeSubscription = appSubscriptions[0] || null;
    } catch (e) {
      console.error("Billing check error:", e?.message || e);
    }
  }

  const [reviewCap, emailCap, discountCap] = await Promise.all([
    checkReviewCap(shop, plan),
    checkEmailCap(shop, plan),
    checkDiscountCap(shop, plan),
  ]);

  return {
    plan,
    limits: {
      maxReviews: limits.maxReviews === Infinity ? null : limits.maxReviews,
      monthlyEmails: limits.monthlyEmails === Infinity ? null : limits.monthlyEmails,
      monthlyDiscountCodes: limits.monthlyDiscountCodes === Infinity ? null : limits.monthlyDiscountCodes,
    },
    usage: {
      reviews: reviewCap.count,
      emails: emailCap.count,
      discountCodes: discountCap.count,
    },
    caps: {
      reviewsHit: !reviewCap.allowed,
      emailsHit: !emailCap.allowed,
      discountCodesHit: !discountCap.allowed,
    },
    activeSubscription,
    allowlisted,
  };
}

export async function action({ request }) {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "subscribe") {
    const plan = formData.get("plan");
    await billing.request({
      plan,
      isTest: IS_TEST,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
    });
    // billing.request throws a redirect — execution stops here
  }

  if (intent === "cancel") {
    const subscriptionId = formData.get("subscriptionId");
    await billing.cancel({ subscriptionId, isTest: IS_TEST, prorate: true });
    return { cancelled: true };
  }

  return null;
}

function PlanCard({ name, price, features, isCurrent, isAllowlisted, subscriptionId, onSubscribe, onCancel, isLoading }) {
  return (
    <div style={{
      border: isCurrent ? "2px solid #008060" : "1px solid #e3e3e3",
      borderRadius: "8px",
      padding: "1.5rem",
      flex: "1",
      minWidth: "200px",
      background: isCurrent ? "#f0faf6" : "#fff",
      position: "relative",
    }}>
      {isCurrent && (
        <div style={{
          position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)",
          background: "#008060", color: "#fff", fontSize: "0.75rem", fontWeight: 600,
          padding: "2px 12px", borderRadius: "12px", whiteSpace: "nowrap",
        }}>
          Current plan
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.25rem" }}>{name}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem", color: "#008060" }}>
        {price === 0 ? "Free" : `$${price}/mo`}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem 0", fontSize: "0.9rem", lineHeight: "1.8" }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: "flex", gap: "0.4rem" }}>
            <span style={{ color: "#008060" }}>✓</span> {f}
          </li>
        ))}
      </ul>

      {!isCurrent && !isAllowlisted && (
        <button
          onClick={() => onSubscribe(name)}
          disabled={isLoading}
          style={{
            width: "100%", padding: "0.6rem 0", border: "none", borderRadius: "6px",
            background: "#008060", color: "#fff", fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.7 : 1, fontSize: "0.95rem",
          }}
        >
          {price === 0 ? "Downgrade to Free" : `Upgrade to ${name}`}
        </button>
      )}

      {isCurrent && !isAllowlisted && name !== "Free" && (
        <button
          onClick={() => onCancel(subscriptionId)}
          disabled={isLoading}
          style={{
            width: "100%", padding: "0.6rem 0", border: "1px solid #ccc", borderRadius: "6px",
            background: "#fff", color: "#666", cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.7 : 1, fontSize: "0.9rem",
          }}
        >
          Cancel subscription
        </button>
      )}
    </div>
  );
}

function UsageStat({ label, used, limit, upgradeNeeded }) {
  const isUnlimited = limit === null;
  const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const atLimit = !isUnlimited && used >= limit;
  const nearLimit = !isUnlimited && pct >= 80 && !atLimit;
  const barColor = atLimit ? "#c62828" : nearLimit ? "#e67e22" : "#008060";

  return (
    <div style={{ flex: "1", minWidth: "140px" }}>
      <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "0.25rem" }}>{label}</div>
      {isUnlimited ? (
        <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#008060" }}>
          {used !== null ? `${used.toLocaleString()} used` : "Unlimited"}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.3rem" }}>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: barColor }}>
              {used.toLocaleString()}
            </span>
            <span style={{ fontSize: "0.8rem", color: "#888" }}>/ {limit.toLocaleString()}</span>
          </div>
          <div style={{ height: "6px", background: "#eee", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: "3px", transition: "width 0.3s" }} />
          </div>
          {atLimit && upgradeNeeded && (
            <div style={{ fontSize: "0.75rem", color: "#c62828", marginTop: "0.25rem", fontWeight: 500 }}>
              Limit reached
            </div>
          )}
          {nearLimit && (
            <div style={{ fontSize: "0.75rem", color: "#e67e22", marginTop: "0.25rem" }}>
              {limit - used} remaining
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BillingPage() {
  const { plan, limits, usage, caps, activeSubscription, allowlisted } = useLoaderData();
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  const currentPlanName = plan === PLAN_FREE ? "Free" : plan;
  const anyCapHit = caps.reviewsHit || caps.emailsHit || caps.discountCodesHit;

  const plans = [
    {
      name: "Free",
      price: 0,
      features: [
        "Up to 50 reviews",
        "2 photos per review",
        "10 review request emails/month",
        "5 discount reward codes/month",
        "All display widgets",
        "Widget customisation",
      ],
    },
    {
      name: PLAN_STARTER,
      price: 4.99,
      features: [
        "Up to 500 reviews",
        "2 photos per review",
        "250 review request emails/month",
        "Unlimited discount codes",
        "All display widgets",
        "Widget customisation",
      ],
    },
    {
      name: PLAN_PRO,
      price: 14.99,
      features: [
        "Unlimited reviews",
        "2 photos per review",
        "Unlimited review request emails",
        "Unlimited discount codes",
        "All display widgets",
        "Widget customisation",
        "Priority support",
      ],
    },
  ];

  function handleSubscribe(planName) {
    if (planName === "Free") {
      if (activeSubscription) {
        fetcher.submit(
          { intent: "cancel", subscriptionId: activeSubscription.id },
          { method: "post" }
        );
      }
      return;
    }
    fetcher.submit({ intent: "subscribe", plan: planName }, { method: "post" });
  }

  function handleCancel(subscriptionId) {
    if (!subscriptionId) return;
    fetcher.submit({ intent: "cancel", subscriptionId }, { method: "post" });
  }

  return (
    <s-page heading="Billing & Plans">
      {allowlisted && (
        <s-section>
          <div style={{
            background: "#f0faf6", border: "1px solid #008060", borderRadius: "8px",
            padding: "1rem 1.25rem", color: "#008060", fontWeight: 500,
          }}>
            ✓ This store has complimentary Pro access.
          </div>
        </s-section>
      )}

      {!allowlisted && anyCapHit && (
        <s-section>
          <div style={{
            background: "#fff8e1", border: "1px solid #f9a825", borderRadius: "8px",
            padding: "1rem 1.25rem",
          }}>
            <div style={{ fontWeight: 600, color: "#e65100", marginBottom: "0.5rem" }}>
              ⚠ You have reached a plan limit
            </div>
            <ul style={{ margin: 0, padding: "0 0 0 1.25rem", color: "#444", fontSize: "0.9rem", lineHeight: 1.8 }}>
              {caps.reviewsHit && (
                <li>New reviews from customers are being <strong>rejected</strong> — your review storage is full.</li>
              )}
              {caps.discountCodesHit && (
                <li>Customers who write reviews are <strong>not receiving their discount reward codes</strong> this month.</li>
              )}
              {caps.emailsHit && (
                <li>Review request emails are <strong>not being sent</strong> via Shopify Flow this month.</li>
              )}
            </ul>
            <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#666" }}>
              Upgrade your plan below to restore these features immediately.
            </div>
          </div>
        </s-section>
      )}

      <s-section heading="Your current plan">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="inline" gap="base" align="space-between">
            <s-stack direction="block" gap="tight">
              <s-text variant="headingMd">{currentPlanName}</s-text>
              <s-text tone="subdued">
                {plan === PLAN_FREE && "Free forever — upgrade anytime to unlock higher limits."}
                {plan === PLAN_STARTER && "$4.99/month — billed through Shopify."}
                {plan === PLAN_PRO && "$14.99/month — billed through Shopify."}
              </s-text>
            </s-stack>
            <div style={{
              background: plan === PLAN_PRO ? "#008060" : plan === PLAN_STARTER ? "#0066cc" : "#666",
              color: "#fff", padding: "0.3rem 0.9rem", borderRadius: "20px",
              fontWeight: 600, fontSize: "0.85rem", alignSelf: "center", whiteSpace: "nowrap",
            }}>
              {currentPlanName}
            </div>
          </s-stack>

          <div style={{ marginTop: "1.25rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
            <UsageStat
              label="Reviews stored"
              used={usage.reviews}
              limit={limits.maxReviews}
              upgradeNeeded={!allowlisted && plan !== PLAN_PRO}
            />
            <UsageStat
              label="Email requests this month"
              used={usage.emails}
              limit={limits.monthlyEmails}
              upgradeNeeded={!allowlisted && plan !== PLAN_PRO}
            />
            <UsageStat
              label="Discount codes this month"
              used={usage.discountCodes}
              limit={limits.monthlyDiscountCodes}
              upgradeNeeded={!allowlisted && plan !== PLAN_PRO}
            />
          </div>
        </s-box>
      </s-section>

      <s-section heading="Plans">
        {fetcher.data?.cancelled && (
          <div style={{
            background: "#f0faf6", border: "1px solid #008060", borderRadius: "6px",
            padding: "0.75rem 1rem", marginBottom: "1rem", color: "#008060",
          }}>
            Subscription cancelled. You&apos;re now on the Free plan.
          </div>
        )}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {plans.map((p) => (
            <PlanCard
              key={p.name}
              name={p.name}
              price={p.price}
              features={p.features}
              isCurrent={currentPlanName === p.name}
              isAllowlisted={allowlisted}
              subscriptionId={activeSubscription?.id}
              onSubscribe={handleSubscribe}
              onCancel={handleCancel}
              isLoading={isLoading}
            />
          ))}
        </div>
        <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "#888" }}>
          All plans billed monthly through Shopify. Cancel anytime.
        </div>
      </s-section>
    </s-page>
  );
}
