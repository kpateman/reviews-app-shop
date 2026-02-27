import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import cache from "../utils/cache.server";

const inputStyle = { padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.9rem", width: "100%", maxWidth: "400px" };

function sanitizeColor(val, def) {
  const v = (val || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : def;
}

function badgeTextColor(hex) {
  const m = (hex || "#2e7d32").replace("#", "");
  if (m.length !== 6) return "#ffffff";
  const toLinear = c => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * toLinear(parseInt(m.slice(0, 2), 16)) + 0.7152 * toLinear(parseInt(m.slice(2, 4), 16)) + 0.0722 * toLinear(parseInt(m.slice(4, 6), 16));
  return L > 0.179 ? "#1a1a1a" : "#ffffff";
}

function AppearancePreview({ appearance }) {
  const radius = parseInt(appearance.borderRadius, 10) || 0;
  const btnRadius = Math.min(radius, 8);
  const badgeBg = appearance.badgeColor || "#2e7d32";
  const badgeText = badgeTextColor(badgeBg);
  return (
    <div>
      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>Preview</div>
      <div style={{ padding: "1.25rem", background: "#f6f6f7", borderRadius: "8px", fontFamily: "system-ui, -apple-system, sans-serif", fontSize: "14px" }}>
        <div style={{ background: appearance.bgColor === "transparent" ? "transparent" : (appearance.bgColor || "#ffffff"), borderRadius: radius + "px", padding: "1rem 1.25rem", boxShadow: "0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)", marginBottom: "0.75rem" }}>
          {/* Card header: name + badge on left, stars on right — matches real review-card-header layout */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <div>
              <div style={{ fontWeight: 600, color: appearance.textColor || "#444" }}>
                Fred Bloggs
                <span style={{ display: "inline-block", background: badgeBg, color: badgeText, fontSize: "0.75em", padding: "0.2rem 0.5rem", borderRadius: "4px", marginLeft: "0.5rem", fontWeight: 400 }}>Verified Purchase</span>
              </div>
              <div style={{ fontSize: "0.85em", color: "#666", marginTop: "0.15rem" }}>2 days ago</div>
            </div>
            <div style={{ color: appearance.starColor || "#f5a623", fontSize: "1.1rem" }}>★★★★★</div>
          </div>
          <div style={{ fontWeight: 600, color: appearance.textColor || "#444", marginBottom: "0.5rem", fontSize: "1.1em" }}>Great product!</div>
          <div style={{ color: appearance.textColor || "#444", fontSize: "0.9em", lineHeight: 1.5 }}>Really happy with my purchase. The quality exceeded my expectations and delivery was fast.</div>
        </div>
        <button style={{ background: appearance.primaryColor || "#000", color: "#fff", border: "none", borderRadius: btnRadius + "px", padding: "0.5rem 1.25rem", fontSize: "13px", cursor: "default", fontWeight: 500 }}>
          Write a Review
        </button>
      </div>
    </div>
  );
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  let settings = null;
  try {
    settings = await prisma.shopSettings.findUnique({ where: { shop } });
    if (!settings) {
      settings = await prisma.shopSettings.create({ data: { shop } });
    }
  } catch {
    settings = {};
  }
  return {
    productReviewsTitle: settings.productReviewsTitle ?? "Customer Reviews",
    siteReviewsTitle: settings.siteReviewsTitle ?? "What People Are Saying",
    carouselTitle: settings.carouselTitle ?? "What Our Customers Say",
    reviewFormTitle: settings.reviewFormTitle ?? "Write a Review",
    photoGalleryTitle: settings.photoGalleryTitle ?? "Customer Photos",
    appearance: {
      starColor: settings.widgetStarColor ?? "#f5a623",
      primaryColor: settings.widgetPrimaryColor ?? "#000000",
      borderRadius: String(settings.widgetBorderRadius ?? 8),
      badgeColor: settings.widgetBadgeColor ?? "#2e7d32",
      bgColor: settings.widgetBgColor ?? "#ffffff",
      textColor: settings.widgetTextColor ?? "#444444",
    },
  };
};

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") || "titles";

  if (intent === "appearance") {
    const widgetStarColor = sanitizeColor(formData.get("starColor"), "#f5a623");
    const widgetPrimaryColor = sanitizeColor(formData.get("primaryColor"), "#000000");
    const widgetBorderRadius = Math.min(48, Math.max(0, parseInt(formData.get("borderRadius"), 10) || 8));
    const widgetBadgeColor = sanitizeColor(formData.get("badgeColor"), "#2e7d32");
    const widgetBgColor = formData.get("bgColor") === "transparent" ? "transparent" : sanitizeColor(formData.get("bgColor"), "#ffffff");
    const widgetTextColor = sanitizeColor(formData.get("textColor"), "#444444");
    await prisma.shopSettings.upsert({
      where: { shop },
      update: { widgetStarColor, widgetPrimaryColor, widgetBorderRadius, widgetBadgeColor, widgetBgColor, widgetTextColor },
      create: { shop, widgetStarColor, widgetPrimaryColor, widgetBorderRadius, widgetBadgeColor, widgetBgColor, widgetTextColor },
    });
    // Bust the storefront API cache so widgets pick up new appearance immediately
    try { await cache.delByPrefix(`app-proxy:reviews:${shop}:`); } catch (e) {}
    return { success: true, intent: "appearance" };
  }

  const productReviewsTitle = (formData.get("productReviewsTitle") || "Customer Reviews").slice(0, 100);
  const siteReviewsTitle = (formData.get("siteReviewsTitle") || "What People Are Saying").slice(0, 100);
  const carouselTitle = (formData.get("carouselTitle") || "What Our Customers Say").slice(0, 100);
  const reviewFormTitle = (formData.get("reviewFormTitle") || "Write a Review").slice(0, 100);
  const photoGalleryTitle = (formData.get("photoGalleryTitle") || "Customer Photos").slice(0, 100);

  await prisma.shopSettings.upsert({
    where: { shop },
    update: { productReviewsTitle, siteReviewsTitle, carouselTitle, reviewFormTitle, photoGalleryTitle },
    create: { shop, productReviewsTitle, siteReviewsTitle, carouselTitle, reviewFormTitle, photoGalleryTitle },
  });

  return { success: true, intent: "titles" };
}

const colorPickerStyle = { width: "44px", height: "34px", padding: "2px", borderRadius: "4px", border: "1px solid #ccc", cursor: "pointer", background: "none" };
const colorTextStyle = { padding: "0.4rem 0.5rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.9rem", width: "90px", fontFamily: "monospace" };

export default function Widgets() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const appearanceFetcher = useFetcher();

  const [titles, setTitles] = useState({
    productReviewsTitle: loaderData.productReviewsTitle,
    siteReviewsTitle: loaderData.siteReviewsTitle,
    carouselTitle: loaderData.carouselTitle,
    reviewFormTitle: loaderData.reviewFormTitle,
    photoGalleryTitle: loaderData.photoGalleryTitle,
  });
  const [appearance, setAppearance] = useState(loaderData.appearance);

  const saving = fetcher.state === "submitting";
  const saved = fetcher.state === "idle" && fetcher.data?.intent === "titles" && fetcher.data?.success;

  const appearanceSaving = appearanceFetcher.state === "submitting";
  const appearanceSaved = appearanceFetcher.state === "idle" && appearanceFetcher.data?.intent === "appearance" && appearanceFetcher.data?.success;

  const handleSave = () => {
    const formData = new FormData();
    formData.set("intent", "titles");
    for (const [key, val] of Object.entries(titles)) {
      formData.set(key, val);
    }
    fetcher.submit(formData, { method: "post" });
  };

  const handleAppearanceSave = () => {
    const formData = new FormData();
    formData.set("intent", "appearance");
    for (const [key, val] of Object.entries(appearance)) {
      formData.set(key, val);
    }
    appearanceFetcher.submit(formData, { method: "post" });
  };

  const colorField = (field, label) => (
    <s-stack direction="block" gap="tight">
      <s-text tone="subdued">{label}</s-text>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="color"
          value={appearance[field]}
          onChange={(e) => setAppearance(a => ({ ...a, [field]: e.target.value }))}
          style={colorPickerStyle}
        />
        <input
          type="text"
          value={appearance[field]}
          onChange={(e) => setAppearance(a => ({ ...a, [field]: e.target.value }))}
          style={colorTextStyle}
          maxLength={7}
          spellCheck={false}
        />
      </div>
    </s-stack>
  );

  const titleInput = (field, label) => (
    <s-stack direction="block" gap="tight">
      <s-text tone="subdued">{label}</s-text>
      <input
        value={titles[field]}
        onChange={(e) => setTitles((t) => ({ ...t, [field]: e.target.value }))}
        style={inputStyle}
        maxLength={100}
      />
    </s-stack>
  );

  return (
    <s-page heading="Theme Widgets">
      <s-section heading="Widget Appearance">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              These colours and corner radius apply globally to all review widgets on your storefront. Changes take effect immediately after saving.
            </s-paragraph>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
              {colorField("starColor", "Star colour")}
              {colorField("primaryColor", "Button colour")}
              {colorField("badgeColor", "Verified badge colour")}
              <s-stack direction="block" gap="tight">
                <s-text tone="subdued">Card background</s-text>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  {appearance.bgColor !== "transparent" && (
                    <>
                      <input type="color" value={appearance.bgColor || "#ffffff"} onChange={(e) => setAppearance(a => ({ ...a, bgColor: e.target.value }))} style={colorPickerStyle} />
                      <input type="text" value={appearance.bgColor || "#ffffff"} onChange={(e) => setAppearance(a => ({ ...a, bgColor: e.target.value }))} style={colorTextStyle} maxLength={7} spellCheck={false} />
                    </>
                  )}
                  <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={appearance.bgColor === "transparent"} onChange={(e) => setAppearance(a => ({ ...a, bgColor: e.target.checked ? "transparent" : "#ffffff" }))} />
                    Transparent
                  </label>
                </div>
              </s-stack>
              {colorField("textColor", "Review text colour")}
              <s-stack direction="block" gap="tight">
                <s-text tone="subdued">Card corner radius</s-text>
                <select
                  value={appearance.borderRadius}
                  onChange={(e) => setAppearance(a => ({ ...a, borderRadius: e.target.value }))}
                  style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.9rem" }}
                >
                  <option value="0">None — square</option>
                  <option value="4">Small — 4px</option>
                  <option value="8">Medium — 8px</option>
                  <option value="12">Large — 12px</option>
                  <option value="16">Extra large — 16px</option>
                  <option value="24">Pill — 24px</option>
                </select>
              </s-stack>
            </div>
            <AppearancePreview appearance={appearance} />
            <s-stack direction="inline" gap="base" align="start">
              <s-button variant="primary" onClick={handleAppearanceSave} disabled={appearanceSaving}>
                {appearanceSaving ? "Saving…" : "Save appearance"}
              </s-button>
              {appearanceSaved && <s-text tone="success">Saved!</s-text>}
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Product Reviews">
        <s-stack direction="block" gap="base">
          {titleInput("productReviewsTitle", "Widget heading")}
          <s-paragraph>
            Display star ratings and customer reviews directly on your product pages. This is the core widget and the best place to start.
          </s-paragraph>
          <s-numbered-list>
            <s-list-item>Go to <s-text fontWeight="bold">Online Store → Themes</s-text>. </s-list-item>
            <s-list-item>Click <s-text fontWeight="bold">Customize</s-text>. </s-list-item>
            <s-list-item>Navigate to a <s-text fontWeight="bold">Product</s-text> page template. </s-list-item>
            <s-list-item>Click <s-text fontWeight="bold">Add section</s-text> and search for <s-text fontWeight="bold">Product Reviews</s-text>. </s-list-item>
            <s-list-item>Position it below the product description and save. </s-list-item>
          </s-numbered-list>
          <s-banner tone="info">
            <s-paragraph>Product reviews are tied to individual products. Customers can submit a review for a specific item they purchased.</s-paragraph>
          </s-banner>
        </s-stack>
      </s-section>

      <s-section heading="General Site Reviews">
        <s-stack direction="block" gap="base">
          {titleInput("siteReviewsTitle", "Widget heading")}
          <s-paragraph>
            Show general store reviews on any page — great for an About page, a dedicated Reviews page, or anywhere you want to build trust with new visitors.
          </s-paragraph>
          <s-numbered-list>
            <s-list-item>Go to <s-text fontWeight="bold">Online Store → Themes</s-text>. </s-list-item>
            <s-list-item>Click <s-text fontWeight="bold">Customize</s-text>. </s-list-item>
            <s-list-item>Navigate to the page you want reviews on (e.g. your Home or About page). </s-list-item>
            <s-list-item>Click <s-text fontWeight="bold">Add section</s-text> and search for <s-text fontWeight="bold">Product Reviews</s-text>. </s-list-item>
            <s-list-item>In the block settings, set the <s-text fontWeight="bold">Review Type</s-text> to <s-text fontWeight="bold">Company Reviews</s-text>. </s-list-item>
            <s-list-item>Save. </s-list-item>
          </s-numbered-list>
          <s-banner tone="info">
            <s-paragraph>Company reviews are not tied to a specific product. Use these to showcase your store's overall reputation.</s-paragraph>
          </s-banner>
        </s-stack>
      </s-section>

      <s-section heading="Front Page Carousel">
        <s-stack direction="block" gap="base">
          {titleInput("carouselTitle", "Widget heading")}
          <s-paragraph>
            Display a scrolling carousel of your best reviews on your homepage or any page. A great way to showcase social proof at a glance.
          </s-paragraph>
          <s-numbered-list>
            <s-list-item>Go to <s-text fontWeight="bold">Online Store → Themes</s-text>. </s-list-item>
            <s-list-item>Click <s-text fontWeight="bold">Customize</s-text>. </s-list-item>
            <s-list-item>Navigate to your <s-text fontWeight="bold">Home</s-text> page (or any page). </s-list-item>
            <s-list-item>Click <s-text fontWeight="bold">Add section</s-text> and search for <s-text fontWeight="bold">Reviews Carousel</s-text>. </s-list-item>
            <s-list-item>Configure how many reviews to show and the auto-scroll speed in the block settings. </s-list-item>
            <s-list-item>Save. </s-list-item>
          </s-numbered-list>
          <s-banner tone="info">
            <s-paragraph>The carousel only shows approved reviews. It pulls from all your reviews by default, or you can filter it to show only company reviews.</s-paragraph>
          </s-banner>
        </s-stack>
      </s-section>

      <s-section heading="Add a Review Form">
        <s-stack direction="block" gap="base">
          {titleInput("reviewFormTitle", "Widget heading")}
          <s-paragraph>
            Let customers submit a review directly from any page on your storefront — no email link required. Useful for a dedicated "Leave a Review" page.
          </s-paragraph>
          <s-numbered-list>
            <s-list-item>Go to <s-text fontWeight="bold">Online Store → Themes</s-text>. </s-list-item>
            <s-list-item>Click <s-text fontWeight="bold">Customize</s-text>. </s-list-item>
            <s-list-item>Navigate to the page you want the form on. </s-list-item>
            <s-list-item>Click <s-text fontWeight="bold">Add section</s-text> and search for <s-text fontWeight="bold">Review Form</s-text>. </s-list-item>
            <s-list-item>Save. </s-list-item>
          </s-numbered-list>
          <s-banner tone="info">
            <s-paragraph>The form supports star ratings, written reviews, and photo uploads. Submitted reviews are held for moderation unless auto-approve is enabled in Settings.</s-paragraph>
          </s-banner>
        </s-stack>
      </s-section>

      <s-section heading="Photo Gallery">
        <s-stack direction="block" gap="base">
          {titleInput("photoGalleryTitle", "Widget heading")}
          <s-paragraph>
            Display a grid of customer-submitted review photos. Perfect for showcasing real product photos on your product pages or homepage.
          </s-paragraph>
          <s-numbered-list>
            <s-list-item>Go to <s-text fontWeight="bold">Online Store → Themes</s-text>. </s-list-item>
            <s-list-item>Click <s-text fontWeight="bold">Customize</s-text>. </s-list-item>
            <s-list-item>Navigate to the page where you want photos displayed. </s-list-item>
            <s-list-item>Click <s-text fontWeight="bold">Add section</s-text> and search for <s-text fontWeight="bold">Photo Gallery</s-text>. </s-list-item>
            <s-list-item>Configure the number of columns and image size in the block settings. </s-list-item>
            <s-list-item>Save. </s-list-item>
          </s-numbered-list>
          <s-banner tone="info">
            <s-paragraph>Only photos from approved reviews are shown. Clicking a photo opens the full review.</s-paragraph>
          </s-banner>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Widget Overview">
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="none">
            <s-text variant="headingSm">Product Reviews</s-text>
            <s-text>Star ratings and written reviews on product pages.</s-text>
          </s-stack>
          <s-stack direction="block" gap="none">
            <s-text variant="headingSm">General Site Reviews</s-text>
            <s-text>Company-level reviews on any page.</s-text>
          </s-stack>
          <s-stack direction="block" gap="none">
            <s-text variant="headingSm">Reviews Carousel</s-text>
            <s-text>Scrolling showcase, great for homepages.</s-text>
          </s-stack>
          <s-stack direction="block" gap="none">
            <s-text variant="headingSm">Review Form</s-text>
            <s-text>Standalone submission form for any page.</s-text>
          </s-stack>
          <s-stack direction="block" gap="none">
            <s-text variant="headingSm">Photo Gallery</s-text>
            <s-text>Grid of customer-submitted review photos.</s-text>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Save Headings">
        <s-stack direction="block" gap="base">
          <s-paragraph>Edit the widget heading for each section above, then save here.</s-paragraph>
          <s-stack direction="inline" gap="base" align="start">
            <s-button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save headings"}
            </s-button>
            {saved && <s-text tone="success">Saved!</s-text>}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Tips">
        <s-stack direction="block" gap="tight">
          <s-paragraph>All widgets are added through the Shopify theme editor — no code required.</s-paragraph>
          <s-paragraph>You can add the same widget to multiple pages and templates.</s-paragraph>
          <s-paragraph>Only <s-text fontWeight="bold">approved</s-text> reviews are shown on your storefront.</s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
