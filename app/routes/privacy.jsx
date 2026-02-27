export function meta() {
  return [{ title: "Privacy Policy – Lean Reviews" }];
}

export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "3rem 1.5rem", fontFamily: "sans-serif", lineHeight: "1.7", color: "#333" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Privacy Policy</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>Lean Reviews &mdash; Last updated: February 2026</p>

      <p>
        Lean Reviews (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;the app&rdquo;) is a Shopify app that enables merchants to collect, manage,
        and display customer reviews. This policy explains what data we collect, how we use it, and your rights in relation to it.
      </p>

      <h2 style={h2}>1. Data We Collect</h2>
      <p>When a merchant installs Lean Reviews, we collect and store the following:</p>
      <ul>
        <li><strong>Store information</strong> — your Shopify store URL and app configuration settings.</li>
        <li><strong>Customer review data</strong> — reviewer name, email address, star rating, review title, review content, and the product or order being reviewed.</li>
        <li><strong>Customer photos</strong> — images optionally attached to reviews, uploaded to and stored on Cloudinary.</li>
        <li><strong>Order data</strong> — order IDs, accessed read-only from Shopify, used only to verify that a reviewer has purchased the product they are reviewing.</li>
        <li><strong>Customer account identifiers</strong> — Shopify customer IDs, used only for verified purchase checks and duplicate review prevention.</li>
      </ul>
      <p>We do not collect payment information, browsing history, or any data unrelated to the review functionality.</p>

      <h2 style={h2}>2. How We Use Data</h2>
      <ul>
        <li>To store and display reviews on your storefront.</li>
        <li>To send review request emails to customers (when enabled by the merchant via Shopify Flow).</li>
        <li>To generate discount codes as review incentives (when enabled by the merchant).</li>
        <li>To verify that reviewers have purchased the product they are reviewing.</li>
        <li>To prevent spam and duplicate submissions.</li>
      </ul>
      <p>We do not sell, rent, or share personal data with third parties for marketing purposes.</p>

      <h2 style={h2}>3. Third-Party Services</h2>
      <p>We use the following third-party services to operate the app:</p>
      <ul>
        <li><strong>Fly.io</strong> — application hosting and database storage. Data is stored in the United States. See <a href="https://fly.io/legal/privacy-policy" style={link}>fly.io/legal/privacy-policy</a>.</li>
        <li><strong>Cloudinary</strong> — image storage and delivery for customer-uploaded review photos. See <a href="https://cloudinary.com/privacy" style={link}>cloudinary.com/privacy</a>.</li>
        <li><strong>Resend</strong> — transactional email delivery for review request emails. See <a href="https://resend.com/legal/privacy-policy" style={link}>resend.com/legal/privacy-policy</a>.</li>
      </ul>

      <h2 style={h2}>4. Data Retention</h2>
      <p>
        Review data is retained for as long as a merchant&rsquo;s store has the app installed. When the app is uninstalled,
        we process a deletion request within 30 days in accordance with Shopify&rsquo;s data protection requirements.
        Merchants may also contact us at any time to request deletion of their store&rsquo;s data.
      </p>

      <h2 style={h2}>5. Merchant Responsibilities</h2>
      <p>
        Merchants using Lean Reviews act as the data controller for their customers&rsquo; personal data. It is the merchant&rsquo;s
        responsibility to ensure their own privacy policy discloses the use of review collection tools and complies with
        applicable laws including GDPR, CCPA, and any other relevant data protection regulations in their jurisdiction.
      </p>

      <h2 style={h2}>6. Your Rights</h2>
      <p>
        If you are a customer whose data has been collected via a review submission, you may contact the merchant directly
        to request access to, correction of, or deletion of your personal data. Merchants can delete individual reviews
        and associated data from within the Lean Reviews admin panel.
      </p>

      <h2 style={h2}>7. Contact</h2>
      <p>
        For privacy-related questions or data deletion requests, please contact us at:{" "}
        <a href="mailto:kpatemanapps@gmail.com" style={link}>kpatemanapps@gmail.com</a>
      </p>
    </div>
  );
}

const h2 = { fontSize: "1.25rem", marginTop: "2rem", marginBottom: "0.5rem" };
const link = { color: "#0066cc" };
