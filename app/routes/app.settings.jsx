import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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
    settings = { shop, requireVerifiedPurchase: false, autoApproveReviews: false, enableSchemaMarkup: true };
  }

  return { settings };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const requireVerifiedPurchase = formData.get("requireVerifiedPurchase") === "true";
  const autoApproveReviews = formData.get("autoApproveReviews") === "true";
  const enableSchemaMarkup = formData.get("enableSchemaMarkup") === "true";

  try {
    await prisma.shopSettings.upsert({
      where: { shop },
      update: {
        requireVerifiedPurchase,
        autoApproveReviews,
        enableSchemaMarkup,
      },
      create: {
        shop,
        requireVerifiedPurchase,
        autoApproveReviews,
        enableSchemaMarkup,
      },
    });
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

  const handleToggle = (setting, currentValue) => {
    const formData = new FormData();
    formData.set("requireVerifiedPurchase", setting === "requireVerifiedPurchase" ? (!currentValue).toString() : settings.requireVerifiedPurchase.toString());
    formData.set("autoApproveReviews", setting === "autoApproveReviews" ? (!currentValue).toString() : settings.autoApproveReviews.toString());
    formData.set("enableSchemaMarkup", setting === "enableSchemaMarkup" ? (!currentValue).toString() : settings.enableSchemaMarkup.toString());
    fetcher.submit(formData, { method: "post" });
  };

  // Use optimistic UI - show the toggled value immediately
  const isSubmitting = fetcher.state === "submitting";
  const optimisticSettings = fetcher.formData ? {
    requireVerifiedPurchase: fetcher.formData.get("requireVerifiedPurchase") === "true",
    autoApproveReviews: fetcher.formData.get("autoApproveReviews") === "true",
    enableSchemaMarkup: fetcher.formData.get("enableSchemaMarkup") === "true",
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
                  When enabled, new reviews are automatically approved and displayed on your storefront.
                  When disabled, reviews require manual approval before appearing.
                </s-text>
              </s-stack>
              <s-button
                variant={optimisticSettings.autoApproveReviews ? "primary" : "tertiary"}
                onClick={() => handleToggle("autoApproveReviews", optimisticSettings.autoApproveReviews)}
                disabled={isSubmitting}
              >
                {optimisticSettings.autoApproveReviews ? "ON" : "OFF"}
              </s-button>
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

      <s-section slot="aside" heading="About Settings">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text fontWeight="bold">Require Verified Purchase:</s-text> Best for preventing fake reviews. Customers must have an order containing the product to review it.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Auto-Approve:</s-text> Saves time but reduces control. Consider keeping this off to moderate reviews before they go live.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}
