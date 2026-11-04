// Token-bucket rate limiter keyed by client (IP). In memory: right for a single
// process; swap for Redis when running several instances.
export function createRateLimiter({ capacity = 10, refillPerSec = capacity / 60, maxKeys = 10000, now = Date.now } = {}) {
  const buckets = new Map();
  return {
    /** @returns {{ ok: boolean, retryAfterSec: number, remaining: number }} */
    take(k, cost = 1) {
      const t = now();
      let b = buckets.get(k);
      if (!b) {
        if (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value); // drop the oldest key
        b = { tokens: capacity, at: t };
      }
      b.tokens = Math.min(capacity, b.tokens + ((t - b.at) / 1000) * refillPerSec); b.at = t;
      buckets.delete(k); buckets.set(k, b); // keep insertion order = recency
      if (b.tokens >= cost) { b.tokens -= cost; return { ok: true, retryAfterSec: 0, remaining: Math.floor(b.tokens) }; }
      return { ok: false, retryAfterSec: Math.ceil((cost - b.tokens) / refillPerSec), remaining: 0 };
    },
    size: () => buckets.size,
  };
}
