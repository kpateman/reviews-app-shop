const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_CLOUD_NAME = "dkxpqdcyx";
const CLOUDINARY_URL_PREFIX = `https://res.cloudinary.com/${ALLOWED_CLOUD_NAME}/`;

/**
 * Validate that an image URL is a legitimate, correctly-sized Cloudinary image.
 *
 * @param {string} url - The image URL to validate
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
export async function validateImageUrl(url) {
  // 1. URL format check
  if (!url || typeof url !== "string") {
    return { valid: false, error: "Missing image URL" };
  }

  if (!url.startsWith(CLOUDINARY_URL_PREFIX)) {
    return { valid: false, error: "Image URL must be from the allowed Cloudinary account" };
  }

  // 2. HEAD request to verify the resource
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });

    if (!res.ok) {
      return { valid: false, error: `Image URL returned HTTP ${res.status}` };
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return { valid: false, error: `Invalid content type: ${contentType}` };
    }

    const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_IMAGE_BYTES) {
      const sizeMB = (contentLength / (1024 * 1024)).toFixed(1);
      return { valid: false, error: `Image too large (${sizeMB} MB, max 5 MB)` };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Failed to verify image: ${err?.message || "network error"}` };
  }
}
