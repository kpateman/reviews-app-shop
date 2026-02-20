import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { backfillProductMetafields } from "../utils/metafields.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  // Get or create settings for this shop (guard DB errors in dev)
  let settings = null;
  try {
    settings = await prisma.shopSettings.findUnique({ where: { shop } });
    if (!settings) {
      settings = await prisma.shopSettings.create({ data: { shop } });
    }
  } catch (dbErr) {
    console.error("ShopSettings DB error (falling back to defaults):", dbErr?.message || dbErr);
    settings = { shop, requireVerifiedPurchase: false, autoApproveMinRating: 0, enableSchemaMarkup: true, reviewDiscountEnabled: false, reviewDiscountPercentage: 10 };
  }

  return { settings };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const requireVerifiedPurchase = formData.get("requireVerifiedPurchase") === "true";
  const autoApproveMinRating = Math.min(5, Math.max(0, parseInt(formData.get("autoApproveMinRating"), 10) || 0));
  const enableSchemaMarkup = formData.get("enableSchemaMarkup") === "true";
  const reviewDiscountEnabled = formData.get("reviewDiscountEnabled") === "true";
  const reviewDiscountPercentage = Math.min(100, Math.max(1, parseInt(formData.get("reviewDiscountPercentage"), 10) || 10));

  try {
    await prisma.shopSettings.upsert({
      where: { shop },
      update: {
        requireVerifiedPurchase,
        autoApproveMinRating,
        enableSchemaMarkup,
        reviewDiscountEnabled,
        reviewDiscountPercentage,
      },
      create: {
        shop,
        requireVerifiedPurchase,
        autoApproveMinRating,
        enableSchemaMarkup,
        reviewDiscountEnabled,
        reviewDiscountPercentage,
      },
    });

    // When schema markup is enabled, backfill metafields for all reviewed products
    if (enableSchemaMarkup) {
      // Fire and forget — don't block the settings save
      backfillProductMetafields(shop).catch((err) =>
        console.error("Backfill error:", err?.message || err)
      );
    }

    return { success: true };
  } catch (dbErr) {
    console.error("ShopSettings upsert error:", dbErr?.message || dbErr);
    // Fail gracefully so the admin UI doesn't crash in development
    return { success: false, error: "Database error" };
  }
}

export default function SettingsPage() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();

  const submitSettings = (overrides) => {
    const formData = new FormData();
    const current = optimisticSettings;
    formData.set("requireVerifiedPurchase", String(overrides.requireVerifiedPurchase ?? current.requireVerifiedPurchase));
    formData.set("autoApproveMinRating", String(overrides.autoApproveMinRating ?? current.autoApproveMinRating));
    formData.set("enableSchemaMarkup", String(overrides.enableSchemaMarkup ?? current.enableSchemaMarkup));
    formData.set("reviewDiscountEnabled", String(overrides.reviewDiscountEnabled ?? current.reviewDiscountEnabled));
    formData.set("reviewDiscountPercentage", String(overrides.reviewDiscountPercentage ?? current.reviewDiscountPercentage));
    fetcher.submit(formData, { method: "post" });
  };

  const handleToggle = (setting, currentValue) => {
    submitSettings({ [setting]: !currentValue });
  };

  // Use optimistic UI
  const isSubmitting = fetcher.state === "submitting";
  const optimisticSettings = fetcher.formData ? {
    requireVerifiedPurchase: fetcher.formData.get("requireVerifiedPurchase") === "true",
    autoApproveMinRating: parseInt(fetcher.formData.get("autoApproveMinRating"), 10) || 0,
    enableSchemaMarkup: fetcher.formData.get("enableSchemaMarkup") === "true",
    reviewDiscountEnabled: fetcher.formData.get("reviewDiscountEnabled") === "true",
    reviewDiscountPercentage: parseInt(fetcher.formData.get("reviewDiscountPercentage"), 10) || 10,
  } : settings;

  return (
    <s-page heading="Settings">
      <s-section heading="Review Submission">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="loose">
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Require Verified Purchase</s-text>
                <s-text tone="subdued">
                  When enabled, only customers who have purchased a product can leave a review for it.
                  When disabled, anyone can review but only purchasers get the "Verified Purchase" badge.
                </s-text>
              </s-stack>
              <s-button
                variant={optimisticSettings.requireVerifiedPurchase ? "primary" : "tertiary"}
                onClick={() => handleToggle("requireVerifiedPurchase", optimisticSettings.requireVerifiedPurchase)}
                disabled={isSubmitting}
              >
                {optimisticSettings.requireVerifiedPurchase ? "ON" : "OFF"}
              </s-button>
            </s-stack>

            <s-divider />

            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Auto-Approve Reviews</s-text>
                <s-text tone="subdued">
                  Automatically approve reviews at or above the selected star rating.
                  Lower-rated reviews will remain pending for manual moderation.
                </s-text>
              </s-stack>
              <select
                value={optimisticSettings.autoApproveMinRating}
                onChange={(e) => submitSettings({ autoApproveMinRating: parseInt(e.target.value, 10) })}
                disabled={isSubmitting}
                style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.9rem" }}
              >
                <option value="0">Off (manual approval)</option>
                <option value="5">5 stars only</option>
                <option value="4">4+ stars</option>
                <option value="3">3+ stars</option>
                <option value="2">2+ stars</option>
                <option value="1">All reviews (1+ stars)</option>
              </select>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="SEO">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="inline" gap="base" align="space-between">
            <s-stack direction="block" gap="tight">
              <s-text variant="headingSm">Schema Markup (Rich Snippets)</s-text>
              <s-text tone="subdued">
                When enabled, adds structured data to product pages so Google can show star ratings in search results.
              </s-text>
            </s-stack>
            <s-button
              variant={optimisticSettings.enableSchemaMarkup ? "primary" : "tertiary"}
              onClick={() => handleToggle("enableSchemaMarkup", optimisticSettings.enableSchemaMarkup)}
              disabled={isSubmitting}
            >
              {optimisticSettings.enableSchemaMarkup ? "ON" : "OFF"}
            </s-button>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Review Incentives">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="loose">
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Discount Code Reward</s-text>
                <s-text tone="subdued">
                  Automatically generate a single-use discount code for customers who submit a review.
                  The code is emailed to the customer once their review is approved.
                </s-text>
              </s-stack>
              <s-button
                variant={optimisticSettings.reviewDiscountEnabled ? "primary" : "tertiary"}
                onClick={() => handleToggle("reviewDiscountEnabled", optimisticSettings.reviewDiscountEnabled)}
                disabled={isSubmitting}
              >
                {optimisticSettings.reviewDiscountEnabled ? "ON" : "OFF"}
              </s-button>
            </s-stack>

            {optimisticSettings.reviewDiscountEnabled && (
              <>
                <s-divider />
                <s-stack direction="inline" gap="base" align="space-between">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="headingSm">Discount Percentage</s-text>
                    <s-text tone="subdued">
                      The percentage off the customer receives. Codes expire after 30 days and are single-use.
                    </s-text>
                  </s-stack>
                  <select
                    value={optimisticSettings.reviewDiscountPercentage}
                    onChange={(e) => submitSettings({ reviewDiscountPercentage: parseInt(e.target.value, 10) })}
                    disabled={isSubmitting}
                    style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.9rem" }}
                  >
                    <option value="5">5% off</option>
                    <option value="10">10% off</option>
                    <option value="15">15% off</option>
                    <option value="20">20% off</option>
                    <option value="25">25% off</option>
                  </select>
                </s-stack>
              </>
            )}
          </s-stack>
        </s-box>
      </s-section>

      <s-section slot="aside" heading="About Settings">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text fontWeight="bold">Require Verified Purchase:</s-text> Best for preventing fake reviews. Customers must have an order containing the product to review it.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Auto-Approve:</s-text> Set a star threshold to auto-approve positive reviews while holding lower-rated ones for moderation. "4+ stars" is a popular choice.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Discount Reward:</s-text> Incentivizes reviews by giving customers a unique single-use discount code after submitting. Codes are created as Shopify discounts and expire after 30 days.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}
