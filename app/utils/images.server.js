export function cdnify(url) {
  try {
    if (!url || url.startsWith("data:")) return url;
    const base = process.env.CDN_BASE_URL;
    if (!base) return url;
    const u = new URL(url);
    const cdn = new URL(base);
    // preserve path and filename
    return `${cdn.origin}${u.pathname}${u.search}`;
  } catch (e) {
    return url;
  }
}
