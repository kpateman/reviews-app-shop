import Redis from "ioredis";

class MemoryCache {
  constructor() {
    this.store = new Map();
  }
  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  async set(key, value, ttlSeconds = 60) {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }
  async del(key) {
    this.store.delete(key);
  }
  async delByPrefix(prefix) {
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

let client;
if (process.env.REDIS_URL) {
  client = new Redis(process.env.REDIS_URL);
}

const cache = client
  ? {
      get: async (k) => {
        const v = await client.get(k);
        return v ? JSON.parse(v) : null;
      },
      set: async (k, v, ttl = 60) => {
        const s = JSON.stringify(v);
        if (ttl) await client.set(k, s, "EX", ttl);
        else await client.set(k, s);
      },
      del: async (k) => client.del(k),
      delByPrefix: async (prefix) => {
        // Use SCAN to find keys matching prefix*
        const stream = client.scanStream({ match: `${prefix}*`, count: 100 });
        for await (const keys of stream) {
          if (keys.length) await client.del(...keys);
        }
      },
    }
  : new MemoryCache();

export { client as redisClient };
export default cache;
