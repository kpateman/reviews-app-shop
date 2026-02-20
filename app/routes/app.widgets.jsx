import { useLoaderData, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const inputStyle = { padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.9rem", width: "100%", maxWidth: "400px" };

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
  };
};

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

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

  return { success: true };
}

export default function Widgets() {
  const titles = useLoaderData();
  const fetcher = useFetcher();

  const current = fetcher.formData ? {
    productReviewsTitle: fetcher.formData.get("productReviewsTitle"),
    siteReviewsTitle: fetcher.formData.get("siteReviewsTitle"),
    carouselTitle: fetcher.formData.get("carouselTitle"),
    reviewFormTitle: fetcher.formData.get("reviewFormTitle"),
    photoGalleryTitle: fetcher.formData.get("photoGalleryTitle"),
  } : titles;

  const saved = fetcher.state === "idle" && fetcher.data?.success;
  const saving = fetcher.state === "submitting";

  return (
    <s-page heading="Theme Widgets">
      <s-section heading="Widget Titles">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Set the heading text displayed at the top of each widget on your storefront.
          </s-paragraph>
          <fetcher.Form method="post">
            <s-stack direction="block" gap="base">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Product Reviews</s-text>
                <input name="productReviewsTitle" defaultValue={current.productReviewsTitle} style={inputStyle} maxLength={100} />
              </s-stack>
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">General Site Reviews</s-text>
                <input name="siteReviewsTitle" defaultValue={current.siteReviewsTitle} style={inputStyle} maxLength={100} />
              </s-stack>
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Reviews Carousel</s-text>
                <input name="carouselTitle" defaultValue={current.carouselTitle} style={inputStyle} maxLength={100} />
              </s-stack>
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Review Form</s-text>
                <input name="reviewFormTitle" defaultValue={current.reviewFormTitle} style={inputStyle} maxLength={100} />
              </s-stack>
              <s-stack direction="block" gap="tight">
                <s-text variant="headingSm">Photo Gallery</s-text>
                <input name="photoGalleryTitle" defaultValue={current.photoGalleryTitle} style={inputStyle} maxLength={100} />
              </s-stack>
              <s-stack direction="inline" gap="base" align="start">
                <s-button variant="primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save titles"}
                </s-button>
                {saved && <s-text tone="success">Saved!</s-text>}
              </s-stack>
            </s-stack>
          </fetcher.Form>
        </s-stack>
      </s-section>

      <s-section heading="Product Reviews">
        <s-stack direction="block" gap="base">
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
