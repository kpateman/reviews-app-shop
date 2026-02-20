import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";
import cache from "../utils/cache.server";
import { validateImageUrl } from "../utils/image-validation.server";
import { checkRateLimit } from "../utils/rate-limiter.server";
import { validateReviewToken, markTokenUsed } from "../utils/review-tokens.server";
import { updateProductReviewCount } from "../utils/metafields.server";
import { createReviewDiscountCode } from "../utils/discount.server";
import { sendDiscountRewardEmail } from "../utils/email.server";

function liquidResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "application/liquid" },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorPage(title, message) {
  return liquidResponse(`
    <div style="max-width:600px;margin:3rem auto;text-align:center;font-family:inherit;">
      <h2 style="margin-bottom:1rem;">${title}</h2>
      <p style="color:#666;">${message}</p>
      <a href="/" style="display:inline-block;margin-top:1.5rem;padding:0.75rem 1.5rem;background:#000;color:#fff;border-radius:4px;text-decoration:none;">Continue Shopping</a>
    </div>
  `);
}

// GET — render the pre-filled review form
export async function loader({ request }) {
  let shop = null;
  try {
    const { session } = await authenticate.public.appProxy(request);
    shop = session?.shop;
  } catch (e) {
    if (process.env.NODE_ENV === "development" || process.env.DEV_BYPASS_APP_PROXY === "1") {
      shop = new URL(request.url).searchParams.get("shop");
    }
  }
  if (!shop) return errorPage("Unauthorized", "This link could not be verified.");

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const preRating = Math.min(5, Math.max(0, parseInt(url.searchParams.get("rating") || "0", 10)));

  if (!token) return errorPage("Invalid Link", "This review link is missing a token.");

  const record = await validateReviewToken(token);
  if (!record) return errorPage("Link Expired", "This review link has already been used or has expired. If you believe this is an error, please contact the store.");

  // Check if they already reviewed this product
  const existing = await prisma.review.findFirst({
    where: { shop, customerEmail: record.customerEmail, productId: record.productId, type: "product" },
  });
  if (existing) return errorPage("Already Reviewed", "You have already submitted a review for this product. Thank you!");

  return liquidResponse(renderForm(record, preRating));
}

// POST — submit the review
export async function action({ request }) {
  let shop = null;
  try {
    const { session } = await authenticate.public.appProxy(request);
    shop = session?.shop;
  } catch (e) {
    if (process.env.NODE_ENV === "development" || process.env.DEV_BYPASS_APP_PROXY === "1") {
      shop = new URL(request.url).searchParams.get("shop");
    }
  }
  if (!shop) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const formData = await request.formData();
    const token = formData.get("token");
    const rating = parseInt(formData.get("rating"), 10);
    const title = formData.get("title");
    const content = formData.get("content");

    // Validate token
    const record = await validateReviewToken(token);
    if (!record) return jsonResponse({ error: "This review link has expired or already been used." }, 400);

    // Validate fields
    if (!rating || !title || !content) return jsonResponse({ error: "Please fill in all fields." }, 400);
    if (rating < 1 || rating > 5) return jsonResponse({ error: "Rating must be between 1 and 5." }, 400);
    if (title.length > 100) return jsonResponse({ error: "Title must be 100 characters or fewer." }, 400);
    if (content.length > 1000) return jsonResponse({ error: "Review must be 1,000 characters or fewer." }, 400);

    // Rate limit
    const rl = await checkRateLimit(`rl:review:${shop}:${record.customerEmail}`);
    if (!rl.allowed) return jsonResponse({ error: "Too many reviews submitted. Please try again later." }, 429);

    // Duplicate check
    const existing = await prisma.review.findFirst({
      where: { shop, customerEmail: record.customerEmail, productId: record.productId, type: "product" },
    });
    if (existing) return jsonResponse({ error: "You have already reviewed this product." }, 400);

    // Shop settings
    let shopSettings = await prisma.shopSettings.findUnique({ where: { shop } });
    if (!shopSettings) shopSettings = { autoApproveMinRating: 0, reviewDiscountEnabled: false, reviewDiscountPercentage: 10 };

    const status = shopSettings.autoApproveMinRating > 0 && rating >= shopSettings.autoApproveMinRating ? "approved" : "pending";

    // Look up product handle for gallery links
    let productHandle = null;
    if (record.productId) {
      try {
        const { admin } = await unauthenticated.admin(shop);
        const res = await admin.graphql(`query { node(id: "${record.productId}") { ... on Product { handle } } }`);
        const nodeData = await res.json();
        productHandle = nodeData.data?.node?.handle || null;
      } catch (e) { /* non-critical */ }
    }

    // Create review
    const review = await prisma.review.create({
      data: {
        shop,
        productId: record.productId,
        productTitle: record.productTitle,
        productHandle,
        customerId: record.customerId,
        customerEmail: record.customerEmail,
        customerName: record.customerName,
        orderId: record.orderId,
        type: "product",
        rating,
        title,
        content,
        status,
      },
    });

    // Handle images
    let imagesSaved = 0;
    const imagesJson = formData.get("images");
    let images = [];
    if (imagesJson) {
      try { images = JSON.parse(imagesJson); } catch (e) {}
    }

    for (const img of images.slice(0, 2)) {
      try {
        const validation = await validateImageUrl(img.url);
        if (!validation.valid) continue;
        await prisma.reviewImage.create({
          data: {
            reviewId: review.id,
            filename: img.name || "image.jpg",
            url: img.url,
            cloudinaryPublicId: img.publicId || null,
            status: "pending",
          },
        });
        imagesSaved++;
      } catch (e) {}
    }

    // Invalidate caches
    try {
      await cache.delByPrefix(`app-proxy:reviews:${shop}:`);
      await cache.delByPrefix(`reviews:${shop}:`);
    } catch (e) {}

    // Update metafield
    if (status === "approved" && record.productId) {
      updateProductReviewCount(shop, record.productId).catch(() => {});
    }

    // Mark token as used
    await markTokenUsed(token);

    // If auto-approved and discount enabled, generate + email the discount code
    if (status === "approved" && shopSettings.reviewDiscountEnabled && record.customerEmail) {
      createReviewDiscountCode(shop, shopSettings.reviewDiscountPercentage, record.customerName)
        .then((code) => {
          if (code) {
            sendDiscountRewardEmail({
              to: record.customerEmail,
              customerName: record.customerName,
              shopName: shop.replace(".myshopify.com", ""),
              discountCode: code,
              discountPercentage: shopSettings.reviewDiscountPercentage,
            }).catch((err) => console.error("Discount email error:", err));
          }
        })
        .catch((err) => console.error("Discount creation error:", err));
    }

    let message = record.orderId
      ? "Thank you! Your verified purchase review has been submitted"
      : "Thank you! Your review has been submitted";
    message += status === "approved" ? " and is now live!" : " and is pending approval.";
    if (imagesSaved > 0) message += ` ${imagesSaved} photo(s) uploaded and pending approval.`;

    return jsonResponse({ success: true, message }, 201);
  } catch (error) {
    console.error("Error creating review from email token:", error);
    return jsonResponse({ error: "Failed to create review. Please try again." }, 500);
  }
}

function renderForm(record, preRating) {
  const escProductTitle = record.productTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escCustomerName = record.customerName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escToken = record.token.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  return `
<div class="email-review-page">
  <div class="email-review-header">
    <h2>Review: ${escProductTitle}</h2>
    <p class="email-review-greeting">Hi ${escCustomerName}, thanks for your purchase! We'd love to hear your thoughts.</p>
  </div>

  <form id="email-review-form" class="email-review-form">
    <input type="hidden" name="token" value="${escToken}">

    <div class="form-group">
      <label>Your Rating</label>
      <div class="star-rating-input" id="star-rating-input">
        ${[1,2,3,4,5].map(n => `<span class="star${n <= preRating ? ' active' : ''}" data-rating="${n}">${n <= preRating ? '★' : '☆'}</span>`).join('')}
      </div>
      <input type="hidden" name="rating" id="rating-input" value="${preRating || ''}">
    </div>

    <div class="form-group">
      <label for="review-title">Title</label>
      <input type="text" id="review-title" name="title" required maxlength="100" placeholder="Summarize your experience">
      <span class="char-counter" id="title-counter"></span>
    </div>

    <div class="form-group">
      <label for="review-content">Your Review</label>
      <textarea id="review-content" name="content" required rows="4" placeholder="Share the details of your experience..."></textarea>
      <span class="char-counter" id="content-counter"></span>
    </div>

    <div class="form-group">
      <label>Add Photos (optional, max 2)</label>
      <div class="image-upload-container">
        <input type="file" id="review-images" accept="image/*" multiple style="display:none;">
        <button type="button" class="add-photo-btn" id="add-photo-btn">+ Add Photos</button>
        <div id="image-previews" class="image-previews"></div>
      </div>
      <p class="upload-hint">Images will be reviewed before appearing publicly.</p>
    </div>

    <button type="submit" class="submit-review-btn" id="submit-btn">Submit Review</button>
    <p class="form-message" id="form-message"></p>
  </form>
</div>

<style>
  .email-review-page {
    max-width: 600px;
    margin: 2rem auto;
    font-family: inherit;
  }

  .email-review-header {
    margin-bottom: 2rem;
  }

  .email-review-header h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
  }

  .email-review-greeting {
    color: #666;
    margin: 0;
  }

  .email-review-form .form-group {
    margin-bottom: 1.25rem;
  }

  .email-review-form label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  .email-review-form input[type="text"],
  .email-review-form textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    font-family: inherit;
    box-sizing: border-box;
  }

  .email-review-form textarea {
    resize: vertical;
    min-height: 100px;
  }

  .star-rating-input {
    display: flex;
    gap: 0.25rem;
    font-size: 2rem;
    cursor: pointer;
  }

  .star-rating-input .star {
    color: #ddd;
    transition: color 0.2s;
    user-select: none;
  }

  .star-rating-input .star.active,
  .star-rating-input .star:hover {
    color: #f5a623;
  }

  .submit-review-btn {
    background: #000;
    color: #fff;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .submit-review-btn:hover { background: #333; }
  .submit-review-btn:disabled { background: #999; cursor: not-allowed; }

  .form-message {
    margin-top: 1rem;
    padding: 0.75rem;
    border-radius: 4px;
    display: none;
  }

  .form-message.success { display: block; background: #e8f5e9; color: #2e7d32; }
  .form-message.error { display: block; background: #ffebee; color: #c62828; }

  .char-counter {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.8rem;
    color: #999;
    text-align: right;
    opacity: 0;
    transition: opacity 0.3s ease, color 0.3s ease;
  }

  .char-counter.visible { opacity: 1; }
  .char-counter.warn { color: #e67e22; }
  .char-counter.over { color: #e74c3c; }

  .add-photo-btn {
    background: #f5f5f5;
    border: 2px dashed #ccc;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .add-photo-btn:hover { border-color: #999; background: #eee; }

  .image-previews {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
  }

  .image-preview {
    position: relative;
    width: 80px;
    height: 80px;
  }

  .image-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
  }

  .image-preview .remove-btn {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 20px;
    height: 20px;
    background: #e74c3c;
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }

  .upload-hint {
    font-size: 0.8rem;
    color: #888;
    margin-top: 0.5rem;
  }
</style>

<script>
(function() {
  // Star rating
  const stars = document.querySelectorAll('#star-rating-input .star');
  const ratingInput = document.getElementById('rating-input');

  stars.forEach(star => {
    star.addEventListener('click', () => {
      const rating = parseInt(star.dataset.rating);
      ratingInput.value = rating;
      stars.forEach((s, i) => {
        s.textContent = i < rating ? '★' : '☆';
        s.classList.toggle('active', i < rating);
      });
    });
  });

  // Character counters
  function setupCounter(inputEl, counterEl, max) {
    if (!inputEl || !counterEl) return;
    const showAt = Math.floor(max * 0.8);
    const warnAt = Math.floor(max * 0.9);
    inputEl.addEventListener('input', () => {
      const len = inputEl.value.length;
      const remaining = max - len;
      if (len >= showAt) {
        counterEl.classList.add('visible');
        if (len > max) {
          counterEl.textContent = len.toLocaleString() + ' / ' + max.toLocaleString() + ' — a little long, trim to submit';
          counterEl.className = 'char-counter visible over';
        } else if (len >= warnAt) {
          counterEl.textContent = remaining.toLocaleString() + ' character' + (remaining !== 1 ? 's' : '') + ' remaining';
          counterEl.className = 'char-counter visible warn';
        } else {
          counterEl.textContent = len.toLocaleString() + ' / ' + max.toLocaleString();
          counterEl.className = 'char-counter visible';
        }
      } else {
        counterEl.classList.remove('visible');
      }
    });
  }

  setupCounter(document.getElementById('review-title'), document.getElementById('title-counter'), 100);
  setupCounter(document.getElementById('review-content'), document.getElementById('content-counter'), 1000);

  // Image upload
  let selectedImages = [];
  const imageInput = document.getElementById('review-images');
  const previews = document.getElementById('image-previews');
  const addBtn = document.getElementById('add-photo-btn');

  if (addBtn) addBtn.addEventListener('click', () => imageInput.click());

  if (imageInput) {
    imageInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      const remaining = 2 - selectedImages.length;
      for (const file of files.slice(0, remaining)) {
        if (file.size > 5 * 1024 * 1024) { showMsg('Images must be under 5MB', 'error'); continue; }
        try {
          showMsg('Uploading image...', 'error'); // reuse style for visibility
          const fd = new FormData();
          fd.append('file', file);
          fd.append('upload_preset', 'reviews_unsigned');
          fd.append('folder', 'reviews');
          const res = await fetch('https://api.cloudinary.com/v1_1/dkxpqdcyx/image/upload', { method: 'POST', body: fd });
          if (!res.ok) throw new Error('Upload failed');
          const data = await res.json();
          selectedImages.push({ name: file.name, url: data.secure_url, publicId: data.public_id });
          renderPreviews();
          showMsg('Image uploaded!', 'success');
          setTimeout(() => { document.getElementById('form-message').className = 'form-message'; }, 2000);
        } catch (err) {
          showMsg('Failed to upload image.', 'error');
        }
      }
      imageInput.value = '';
    });
  }

  function renderPreviews() {
    if (!previews) return;
    previews.innerHTML = selectedImages.map((img, i) =>
      '<div class="image-preview"><img src="' + img.url + '" alt="Preview"><button type="button" class="remove-btn" data-index="' + i + '">×</button></div>'
    ).join('');
    previews.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedImages.splice(parseInt(btn.dataset.index), 1);
        renderPreviews();
      });
    });
  }

  // Form submission
  const form = document.getElementById('email-review-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ratingInput.value) { showMsg('Please select a rating.', 'error'); return; }

      const titleVal = document.getElementById('review-title').value;
      const contentVal = document.getElementById('review-content').value;
      if (titleVal.length > 100) { showMsg('Title is too long — please keep it under 100 characters.', 'error'); return; }
      if (contentVal.length > 1000) { showMsg('Review is a bit long — please trim to 1,000 characters.', 'error'); return; }

      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Submitting...';

      try {
        const fd = new FormData(form);
        if (selectedImages.length > 0) fd.set('images', JSON.stringify(selectedImages));

        const res = await fetch('/apps/reviews/write', { method: 'POST', body: fd });
        const data = await res.json();

        if (res.ok && data.success) {
          showMsg(data.message || 'Review submitted!', 'success');
          form.querySelectorAll('input:not([type=hidden]), textarea').forEach(el => el.disabled = true);
          btn.style.display = 'none';
        } else {
          showMsg(data.error || 'Something went wrong.', 'error');
          btn.disabled = false;
          btn.textContent = 'Submit Review';
        }
      } catch (err) {
        showMsg('Failed to submit. Please try again.', 'error');
        btn.disabled = false;
        btn.textContent = 'Submit Review';
      }
    });
  }

  function showMsg(text, type) {
    const el = document.getElementById('form-message');
    if (el) { el.textContent = text; el.className = 'form-message ' + type; }
  }
})();
</script>`;
}
