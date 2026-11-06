// Stateless signed session tokens: "v2.<expires>.<nonce>.<hmac>".
// The signing key mixes SESSION_SECRET with a fingerprint of the password, so changing
// the password logs everyone out. Tokens expire (default 7 days) and are compared in constant time.
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const key = (secret, password) => createHash('sha256').update(`${secret || password}\u0000${createHash('sha256').update(password).digest('hex')}`).digest();
const sign = (k, payload) => createHmac('sha256', k).update(payload).digest('base64url');

export const safeEqual = (a, b) => {
  const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
};

/** @returns {string} a new token valid for `ttlSec` */
export function issueSession({ secret, password, ttlSec = 7 * 86400, now = Date.now() }) {
  const payload = `v2.${Math.floor(now / 1000) + ttlSec}.${randomBytes(12).toString('base64url')}`;
  return `${payload}.${sign(key(secret, password), payload)}`;
}

/** @returns {boolean} true when the token was signed with the current key and has not expired */
export function verifySession(token, { secret, password, now = Date.now() }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v2') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  return safeEqual(parts[3], sign(key(secret, password), parts.slice(0, 3).join('.')));
}

export const parseCookies = header => Object.fromEntries(String(header || '').split(';').map(s => s.trim().split('=')).filter(a => a[0]).map(([k, ...v]) => [k, v.join('=')]));

/**
 * Where to send someone after signing in. Only same-site paths are allowed: "//evil.com" and "/\evil.com"
 * are protocol-relative URLs that browsers resolve to another site, so they fall back like any other bad value.
 * @returns {string}
 */
export const safeNextPath = (raw, fallback = '/dashboard') => {
  const s = String(raw || '');
  return /^\/(?![/\\])/.test(s) && !/[\u0000-\u001f]/.test(s) ? s : fallback;
};
