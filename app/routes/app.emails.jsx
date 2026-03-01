import { useState, useCallback } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { generateReviewToken, buildReviewUrl } from "../utils/review-tokens.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);

  const productsResponse = await admin.graphql(`
    query {
      products(first: 100, sortKey: TITLE) {
        edges {
          node {
            id
            title
          }
        }
      }
    }
  `).then(r => r.json()).catch(() => null);

  const shopProducts = productsResponse?.data?.products?.edges?.map(e => ({
    id: e.node.id,
    title: e.node.title,
  })) || [];

  return { shop: session.shop, shopProducts };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const productId = formData.get("productId");
  const productTitle = formData.get("productTitle");
  const customerEmail = formData.get("customerEmail");
  const customerName = formData.get("customerName");

  if (!productId || !productTitle || !customerEmail || !customerName) {
    return { success: false, error: "All fields are required." };
  }

  const { token } = await generateReviewToken({ shop, productId, productTitle, customerEmail, customerName });
  const reviewUrls = {};
  for (let i = 1; i <= 5; i++) reviewUrls[i] = buildReviewUrl(shop, token, i);

  return { success: true, reviewToken: { token, reviewUrl: buildReviewUrl(shop, token), reviewUrls } };
}

export default function EmailsPage() {
  const { shopProducts } = useLoaderData();
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestResult, setRequestResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const requestFetcher = useFetcher();

  const handleRequestSubmit = useCallback((e) => {
    e.preventDefault();
    setRequestResult(null);
    const fd = new FormData(e.target);
    requestFetcher.submit(fd, { method: "post" });
  }, [requestFetcher]);

  const requestData = requestFetcher.data;
  if (requestData?.reviewToken && requestResult?.token !== requestData.reviewToken.token) {
    setRequestResult(requestData.reviewToken);
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <s-page heading="Emails">

      {/* Automated Review Emails */}
      <s-section heading="Automated Review Emails">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Automatically email customers after their order is fulfilled, asking them to review the products they purchased. You choose the delay in Shopify Flow — no manual work needed.
          </s-paragraph>
          <s-banner heading="Setup in Shopify Flow" tone="info">
            <s-numbered-list>
              <s-list-item>Open Shopify Flow and create a new workflow.</s-list-item>
              <s-list-item>Select the <s-text fontWeight="bold">Order fulfilled</s-text> trigger.</s-list-item>
              <s-list-item>Add a <s-text fontWeight="bold">Wait</s-text> step (e.g. 7 days).</s-list-item>
              <s-list-item>Add the <s-text fontWeight="bold">Send review request email</s-text> action.</s-list-item>
              <s-list-item>Turn on the workflow.</s-list-item>
            </s-numbered-list>
            <s-button slot="secondary-actions" variant="secondary" href="shopify:admin/apps/flow">Open Shopify Flow</s-button>
          </s-banner>
          <s-paragraph>
            <s-text tone="neutral">Shopify Flow is free and included with all Shopify plans. Each email includes secure, single-use review links — no customer login required.</s-text>
          </s-paragraph>
        </s-stack>
      </s-section>

      {/* Manual Review Request */}
      <s-section heading="Request a Review">
        <s-stack direction="block" gap="base">
          {!showRequestForm && (
            <>
              <s-paragraph>
                Generate a personal review link to send to a customer manually — useful for following up on specific orders or customers who didn't receive the automated email.
              </s-paragraph>
              <div>
                <s-button variant="primary" onClick={() => { setShowRequestForm(true); setRequestResult(null); }}>
                  Send Review Request
                </s-button>
              </div>
            </>
          )}

          {showRequestForm && (
            <>
              <s-stack direction="inline" gap="base" align="space-between">
                <s-text tone="subdued">Fill in the details below to generate a unique review link for this customer.</s-text>
                <s-button variant="tertiary" onClick={() => { setShowRequestForm(false); setRequestResult(null); }}>
                  Close
                </s-button>
              </s-stack>

              <form onSubmit={handleRequestSubmit}>
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base">
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 500 }}>Customer Email</label>
                      <input name="customerEmail" type="email" required placeholder="customer@example.com"
                        style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 500 }}>Customer Name</label>
                      <input name="customerName" type="text" required placeholder="Jane Doe"
                        style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }} />
                    </div>
                  </s-stack>
                  <s-stack direction="inline" gap="base">
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 500 }}>Product</label>
                      {shopProducts.length > 0 ? (
                        <>
                          <select name="productId" required
                            onChange={(e) => {
                              const sel = shopProducts.find(p => p.id === e.target.value);
                              const titleInput = e.target.form.querySelector('[name="productTitle"]');
                              if (titleInput && sel) titleInput.value = sel.title;
                            }}
                            style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px" }}>
                            <option value="">Select a product...</option>
                            {shopProducts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                          </select>
                          <input name="productTitle" type="hidden" />
                        </>
                      ) : (
                        <>
                          <input name="productId" type="text" required placeholder="gid://shopify/Product/12345"
                            style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }} />
                          <div style={{ marginTop: "8px" }}>
                            <label style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: 500 }}>Product Title</label>
                            <input name="productTitle" type="text" required placeholder="Product name"
                              style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }} />
                          </div>
                        </>
                      )}
                    </div>
                  </s-stack>

                  <s-button variant="primary" type="submit" disabled={requestFetcher.state !== "idle"}>
                    {requestFetcher.state !== "idle" ? "Generating..." : "Generate Review Link"}
                  </s-button>

                  {requestData?.error && (
                    <s-text tone="critical">{requestData.error}</s-text>
                  )}

                  {requestResult && (
                    <s-box padding="base" background="subdued" borderRadius="base">
                      <s-stack direction="block" gap="base">
                        <s-text variant="headingSm">Review link generated!</s-text>
                        <s-text tone="subdued">Share this link with the customer, or use the star-specific URLs in your email template.</s-text>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input type="text" readOnly value={requestResult.reviewUrl}
                            style={{ flex: 1, padding: "8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "13px", background: "#f9f9f9" }} />
                          <s-button variant="tertiary" onClick={() => copyToClipboard(requestResult.reviewUrl)}>
                            {copied ? "Copied!" : "Copy"}
                          </s-button>
                        </div>
                        <details>
                          <summary style={{ cursor: "pointer", fontSize: "13px", color: "#666" }}>Star-specific URLs (for email templates)</summary>
                          <div style={{ marginTop: "8px", fontSize: "13px" }}>
                            {[1,2,3,4,5].map(n => (
                              <div key={n} style={{ marginBottom: "4px" }}>
                                <span style={{ color: "#f5a623" }}>{"★".repeat(n)}{"☆".repeat(5-n)}</span>{" "}
                                <code style={{ fontSize: "12px", wordBreak: "break-all" }}>{requestResult.reviewUrls[n]}</code>
                              </div>
                            ))}
                          </div>
                        </details>
                      </s-stack>
                    </s-box>
                  )}
                </s-stack>
              </form>
            </>
          )}
        </s-stack>
      </s-section>

    </s-page>
  );
}
