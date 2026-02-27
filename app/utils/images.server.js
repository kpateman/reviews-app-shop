function applyCloudinaryTransform(url, transforms) {
  try {
    if (!url || url.startsWith("data:")) return url;
    if (url.includes("res.cloudinary.com")) {
      return url.replace("/image/upload/", "/image/upload/" + transforms + "/");
    }
    const base = process.env.CDN_BASE_URL;
    if (!base) return url;
    const u = new URL(url);
    const cdn = new URL(base);
    return `${cdn.origin}${u.pathname}${u.search}`;
  } catch (e) {
    return url;
  }
}

// Thumbnail — for review card images and photo gallery cells.
// h_300,c_limit: caps height at 300px (2× a 150px CSS display), preserves aspect ratio.
export function cdnify(url) {
  return applyCloudinaryTransform(url, "h_300,c_limit,q_auto,f_auto");
}

// Tiny square — for carousel thumbnails (60×60 CSS display → 120×120 at 2×).
export function cdnifyThumb(url) {
  return applyCloudinaryTransform(url, "w_120,h_120,c_fill,q_auto,f_auto");
}

// Full — for lightbox (large screen display).
export function cdnifyFull(url) {
  return applyCloudinaryTransform(url, "w_1600,q_auto,f_auto");
}
