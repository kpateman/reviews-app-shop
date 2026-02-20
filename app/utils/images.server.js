export function cdnify(url) {
  try {
    if (!url || url.startsWith("data:")) return url;

    // Inject Cloudinary delivery transformation for optimized images
    if (url.includes("res.cloudinary.com")) {
      return url.replace("/image/upload/", "/image/upload/w_600,q_auto,f_auto/");
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
