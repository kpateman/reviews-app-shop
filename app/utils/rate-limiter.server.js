import { redisClient } from "./cache.server";

class MemoryRateLimiter {
  constructor() {
    this.store = new Map();
  }

  async check(key, maxAttempts, windowSeconds) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    let timestamps = this.store.get(key) || [];

    // Prune expired entries
    timestamps = timestamps.filter((t) => now - t < windowMs);

    if (timestamps.length >= maxAttempts) {
      const oldestInWindow = timestamps[0];
      const retryAfterSeconds = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    timestamps.push(now);
    this.store.set(key, timestamps);

    return {
      allowed: true,
      remaining: maxAttempts - timestamps.length,
      retryAfterSeconds: 0,
    };
  }
}

const memoryLimiter = new MemoryRateLimiter();

/**
 * Check whether a request is within the rate limit.
 *
 * @param {string} key   - Unique key (e.g. "rl:review:<shop>:<email>")
 * @param {number} maxAttempts - Max allowed requests in the window (default 5)
 * @param {number} windowSeconds - Window size in seconds (default 3600 = 1 hour)
 * @returns {Promise<{ allowed: boolean, remaining: number, retryAfterSeconds: number }>}
 */
export async function checkRateLimit(key, maxAttempts = 5, windowSeconds = 3600) {
  if (redisClient) {
    try {
      const current = await redisClient.incr(key);

      // First request in window — set the expiry
      if (current === 1) {
        await redisClient.expire(key, windowSeconds);
      }

      if (current > maxAttempts) {
        const ttl = await redisClient.ttl(key);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
        };
      }

      return {
        allowed: true,
        remaining: maxAttempts - current,
        retryAfterSeconds: 0,
      };
    } catch (err) {
      console.error("Redis rate-limit error, falling back to memory:", err?.message);
      // Fall through to memory limiter
    }
  }

  return memoryLimiter.check(key, maxAttempts, windowSeconds);
}
