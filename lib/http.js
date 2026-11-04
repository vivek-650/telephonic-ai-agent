// HTTP building blocks with no framework: typed errors, JSON responses with
// security headers, a bounded JSON body reader and a small parameterised router.

/** An error that maps straight onto an HTTP response. */
export class HttpError extends Error {
  /** @param {number} status @param {string} message @param {object} [details] */
  constructor(status, message, details) { super(message); this.name = 'HttpError'; this.status = status; this.details = details; }
}
export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (what = 'resource') => new HttpError(404, `${what} not found`);
export const conflict = msg => new HttpError(409, msg);

/** Headers on every response. CSP allows the inline scripts and styles the static pages use. */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
};

export function send(res, code, obj, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(JSON.stringify(obj));
}

/** Read a JSON request body, capped at `limit` bytes. Malformed JSON is a 400, oversize a 413. */
export async function readJson(req, limit = 1e6) {
  const chunks = []; let size = 0;
  for await (const ch of req) {
    size += ch.length;
    if (size > limit) throw new HttpError(413, 'payload too large');
    chunks.push(ch);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'invalid JSON'); }
}

/** Read a raw body (for file uploads), capped at `limit` bytes. */
export async function readRaw(req, limit, tooLarge = 'payload too large') {
  const chunks = []; let size = 0;
  for await (const ch of req) { size += ch.length; if (size > limit) throw new HttpError(413, tooLarge); chunks.push(ch); }
  return Buffer.concat(chunks);
}

const REPLY = Symbol('reply');
/** A handler result with an explicit status (and headers). Plain return values are sent as 200. */
export const reply = (status, body, headers = {}) => ({ [REPLY]: true, status, body, headers });
export const isReply = v => Boolean(v && v[REPLY]);

/** Express-style router: `router.post('/api/candidates/:id/stage', handler)`. */
export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([\\w-]+)'; }) + '$');
    this.routes.push({ method, pattern, re, keys, handler });
    return this;
  }
  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }
  /** @returns {{ handler: Function, params: Record<string,string>, pattern: string } | null} */
  match(method, path) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (m) return { handler: r.handler, pattern: r.pattern, params: Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]])) };
    }
    return null;
  }
}

/** Client address, honouring the tunnel's header only when the request came through it. */
export const clientIp = req => String(req.headers['cf-connecting-ip'] || req.socket?.remoteAddress || '');
