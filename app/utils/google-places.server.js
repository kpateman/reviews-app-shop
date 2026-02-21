import cache from "./cache.server";

/**
 * Fetches the aggregate rating and total review count for a Google Place.
 * Results are cached for 1 hour to avoid hammering the Places API.
 * Returns null if the Place ID or API key is missing/invalid.
 */
export async function getGoogleRating(placeId, apiKey) {
  if (!placeId || !apiKey) return null;

  const cacheKey = `google-places:${placeId}`;
  try {
    const cached = await cache.get(cacheKey);
    if (cached) return cached;
  } catch (e) {}

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=rating%2Cuser_ratings_total&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    if (data.status !== "OK" || !data.result) {
      console.error("Google Places API error:", data.status, data.error_message || "");
      return null;
    }

    const result = {
      rating: data.result.rating ?? null,
      totalRatings: data.result.user_ratings_total ?? null,
    };

    try { await cache.set(cacheKey, result, 3600); } catch (e) {}
    return result;
  } catch (err) {
    console.error("Google Places fetch error:", err?.message || err);
    return null;
  }
}
