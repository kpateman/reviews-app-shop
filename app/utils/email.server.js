import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.REVIEW_EMAIL_FROM || "Reviews <onboarding@resend.dev>";

/**
 * Send a review request email to a customer.
 * @param {object} options
 * @param {string} options.to - Customer email address
 * @param {string} options.customerName - Customer's first name or display name
 * @param {string} options.orderName - e.g. "#1001"
 * @param {string} options.shopDomain - e.g. "my-store.myshopify.com"
 * @param {string} options.shopName - e.g. "My Store" (falls back to domain)
 * @param {Array} options.products - Array of { productTitle, reviewUrl, fiveStarUrl, fourStarUrl, threeStarUrl, imageUrl? }
 */
export async function sendReviewRequestEmail({ to, customerName, orderName, shopDomain, shopName, products }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping review request email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  if (!products?.length) {
    return { success: false, error: "No products to review" };
  }

  const storeName = shopName || shopDomain.replace(".myshopify.com", "");
  const subject = `How was your order${orderName ? ` ${orderName}` : ""}? Leave a review!`;

  const html = buildEmailHtml({ customerName, orderName, storeName, products });

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }

    console.log(`Review request email sent to ${to} (id: ${data?.id})`);
    return { success: true, emailId: data?.id };
  } catch (err) {
    console.error("Failed to send review request email:", err?.message || err);
    return { success: false, error: err?.message || "Unknown error" };
  }
}

function buildEmailHtml({ customerName, orderName, storeName, products }) {
  const productBlocks = products.map((p) => `
    <tr>
      <td style="padding: 24px 0; border-bottom: 1px solid #eee;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            ${p.imageUrl ? `
            <td width="80" valign="top" style="padding-right: 16px;">
              <img src="${p.imageUrl}" alt="${escapeHtml(p.productTitle)}" width="80" height="80"
                style="border-radius: 8px; object-fit: cover; display: block;" />
            </td>` : ""}
            <td valign="top">
              <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #1a1a1a;">
                ${escapeHtml(p.productTitle)}
              </p>
              <p style="margin: 0 0 12px; font-size: 14px; color: #666;">
                How would you rate this product?
              </p>
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding-right: 8px;">
                    <a href="${p.fiveStarUrl}" style="display: inline-block; padding: 10px 16px; background: #ff8c00; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
                      &#9733;&#9733;&#9733;&#9733;&#9733;
                    </a>
                  </td>
                  <td style="padding-right: 8px;">
                    <a href="${p.fourStarUrl}" style="display: inline-block; padding: 10px 14px; background: #f5f5f5; color: #333; text-decoration: none; border-radius: 6px; font-size: 14px;">
                      &#9733;&#9733;&#9733;&#9733;
                    </a>
                  </td>
                  <td style="padding-right: 8px;">
                    <a href="${p.threeStarUrl}" style="display: inline-block; padding: 10px 12px; background: #f5f5f5; color: #333; text-decoration: none; border-radius: 6px; font-size: 14px;">
                      &#9733;&#9733;&#9733;
                    </a>
                  </td>
                  <td>
                    <a href="${p.reviewUrl}" style="display: inline-block; padding: 10px 14px; background: #f5f5f5; color: #333; text-decoration: none; border-radius: 6px; font-size: 14px;">
                      Write a review
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Review your order</title>
</head>
<body style="margin: 0; padding: 0; background: #f7f7f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f7f7f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background: #fff; border-radius: 12px; overflow: hidden; max-width: 600px;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; background: #1a1a1a; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; color: #fff; font-weight: 600;">
                ${escapeHtml(storeName)}
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              <h2 style="margin: 0 0 8px; font-size: 22px; color: #1a1a1a; font-weight: 600;">
                How was your order?
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; color: #666; line-height: 1.5;">
                Hi ${escapeHtml(customerName)}, thanks for your recent order${orderName ? ` (${escapeHtml(orderName)})` : ""}!
                We'd love to hear what you thought. Your feedback helps other customers and helps us improve.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                ${productBlocks}
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 32px; background: #fafafa; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 13px; color: #999; text-align: center; line-height: 1.5;">
                You're receiving this because you made a purchase from ${escapeHtml(storeName)}.
                Each review link can only be used once and expires in 30 days.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a discount code reward email after a review is approved.
 */
export async function sendDiscountRewardEmail({ to, customerName, shopName, discountCode, discountPercentage }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping discount reward email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const storeName = shopName || "our store";
  const subject = `Thanks for your review! Here's ${discountPercentage}% off your next order`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your discount code</title>
</head>
<body style="margin: 0; padding: 0; background: #f7f7f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f7f7f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background: #fff; border-radius: 12px; overflow: hidden; max-width: 600px;">
          <tr>
            <td style="padding: 32px 40px 24px; background: #1a1a1a; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; color: #fff; font-weight: 600;">
                ${escapeHtml(storeName)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; text-align: center;">
              <h2 style="margin: 0 0 8px; font-size: 22px; color: #1a1a1a; font-weight: 600;">
                Thanks for your review!
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; color: #666; line-height: 1.5;">
                Hi ${escapeHtml(customerName)}, your review has been published.
                As a thank you, here's a discount code for your next order:
              </p>
              <div style="margin: 0 0 24px; padding: 20px; background: #f0faf0; border: 2px dashed #2e7d32; border-radius: 8px;">
                <p style="margin: 0 0 8px; font-size: 14px; color: #666;">Your discount code:</p>
                <p style="margin: 0; font-size: 28px; font-weight: 700; color: #2e7d32; letter-spacing: 2px;">
                  ${escapeHtml(discountCode)}
                </p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #666;">
                  ${discountPercentage}% off &middot; Single use &middot; Expires in 30 days
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 32px; background: #fafafa; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 13px; color: #999; text-align: center; line-height: 1.5;">
                You're receiving this because you left a review at ${escapeHtml(storeName)}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("Resend discount email error:", error);
      return { success: false, error: error.message };
    }

    console.log(`Discount reward email sent to ${to} (code: ${discountCode}, id: ${data?.id})`);
    return { success: true, emailId: data?.id };
  } catch (err) {
    console.error("Failed to send discount reward email:", err?.message || err);
    return { success: false, error: err?.message || "Unknown error" };
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
