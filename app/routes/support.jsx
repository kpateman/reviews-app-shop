export function meta() {
  return [{ title: "Support – Lean Reviews" }];
}

export default function Support() {
  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "3rem 1.5rem", fontFamily: "sans-serif", lineHeight: "1.7", color: "#333" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Support</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>Lean Reviews</p>

      <p>
        Need help with Lean Reviews? We&rsquo;re happy to assist. Send us an email and we&rsquo;ll get back to you as soon as possible.
      </p>

      <div style={{ background: "#f9f9f9", border: "1px solid #e5e5e5", borderRadius: "8px", padding: "1.5rem", margin: "2rem 0" }}>
        <p style={{ margin: 0 }}>
          <strong>Email support:</strong>{" "}
          <a href="mailto:kpatemanapps@gmail.com" style={{ color: "#0066cc" }}>kpatemanapps@gmail.com</a>
        </p>
      </div>

      <h2 style={{ fontSize: "1.25rem", marginTop: "2rem", marginBottom: "0.75rem" }}>Common Questions</h2>

      <h3 style={h3}>How do I add review widgets to my store?</h3>
      <p>
        In your Shopify admin, go to <strong>Online Store → Themes → Customize</strong>. Add a new section or block and
        look for <strong>Lean Reviews</strong> in the app blocks list. Available blocks include Product Reviews,
        Reviews Carousel, Photo Gallery, Star Rating, and Google Reviews.
      </p>

      <h3 style={h3}>How do I approve or reject reviews?</h3>
      <p>
        Go to the <strong>Lean Reviews app</strong> in your Shopify admin and click <strong>Reviews</strong>.
        New reviews will appear with a Pending status. Click any review to approve, reject, or reply to it.
      </p>

      <h3 style={h3}>How do I set up automated review request emails?</h3>
      <p>
        Review request emails are sent via <strong>Shopify Flow</strong>. In your Shopify admin, go to Flow and
        create a workflow using the <strong>&ldquo;Send review request email&rdquo;</strong> action provided by Lean Reviews.
        Trigger it on any order event, such as order fulfilled or delivery completed.
      </p>

      <h3 style={h3}>How do I connect my Google Reviews?</h3>
      <p>
        In the Lean Reviews app, go to <strong>Settings</strong> and enter your Google Place ID and Google API key.
        Once saved, the Google Rating and Google Reviews blocks will be available in your theme editor.
      </p>

      <h3 style={h3}>Can customers upload photos with their reviews?</h3>
      <p>
        Yes — the review form supports up to 2 photos per review. Photos are held for approval alongside the review text
        and appear in the Photo Gallery block once approved.
      </p>

      <p style={{ marginTop: "2.5rem", color: "#666", fontSize: "0.9rem" }}>
        <a href="/privacy" style={{ color: "#0066cc" }}>Privacy Policy</a>
      </p>
    </div>
  );
}

const h3 = { fontSize: "1rem", fontWeight: "600", marginTop: "1.5rem", marginBottom: "0.25rem" };
