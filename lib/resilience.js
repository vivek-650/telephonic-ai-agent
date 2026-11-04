// Resilience for calls to outside services (Dograh, LLM providers, TURN):
// retries with exponential backoff and jitter, and a circuit breaker so a dead
// dependency fails fast instead of piling up 30 second timeouts.

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** True for failures worth retrying: network errors, timeouts, 429 and 5xx. */
export const isTransient = e => {
  const s = e?.status;
  if (s) return s === 408 || s === 429 || s >= 500;
  return ['AbortError', 'TimeoutError'].includes(e?.name) || /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(String(e?.message || e?.cause?.code || ''));
};

/**
 * Run `fn` up to `attempts` times. Delay = base * 2^n, capped, with full jitter.
 * @template T
 * @param {(attempt: number) => Promise<T>} fn
 * @param {{ attempts?: number, baseMs?: number, maxMs?: number, retryIf?: (e: any) => boolean, onRetry?: (e: any, attempt: number, delay: number) => void }} [opts]
 * @returns {Promise<T>}
 */
export async function retry(fn, { attempts = 3, baseMs = 250, maxMs = 4000, retryIf = isTransient, onRetry } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(i); } catch (e) {
      last = e;
      if (i === attempts - 1 || !retryIf(e)) throw e;
      const delay = Math.random() * Math.min(maxMs, baseMs * 2 ** i);
      onRetry?.(e, i + 1, delay);
      await sleep(delay);
    }
  }
  throw last;
}

export class CircuitOpenError extends Error {
  constructor(name, retryInMs) { super(`${name} is unavailable (circuit open, retry in ${Math.ceil(retryInMs / 1000)}s)`); this.name = 'CircuitOpenError'; this.status = 503; }
}

/**
 * closed -> (threshold consecutive failures) -> open -> (cooldown) -> half-open -> one trial call.
 * A success closes it again; a failed trial reopens it.
 */
export class CircuitBreaker {
  /** @param {string} name @param {{ threshold?: number, cooldownMs?: number, now?: () => number }} [opts] */
  constructor(name, { threshold = 5, cooldownMs = 30000, now = Date.now } = {}) {
    this.name = name; this.threshold = threshold; this.cooldownMs = cooldownMs; this.now = now;
    /** @type {'closed'|'open'|'half-open'} */ this.state = 'closed';
    this.failures = 0; this.openedAt = 0;
  }
  async run(fn) {
    if (this.state === 'open') {
      const left = this.cooldownMs - (this.now() - this.openedAt);
      if (left > 0) throw new CircuitOpenError(this.name, left);
      this.state = 'half-open';
    }
    try {
      const v = await fn();
      this.state = 'closed'; this.failures = 0;
      return v;
    } catch (e) {
      // Only infrastructure failures count; a 400 means the dependency is healthy and we sent something wrong.
      if (isTransient(e)) {
        this.failures++;
        if (this.state === 'half-open' || this.failures >= this.threshold) { this.state = 'open'; this.openedAt = this.now(); }
      }
      throw e;
    }
  }
  snapshot() { return { name: this.name, state: this.state, failures: this.failures }; }
}
