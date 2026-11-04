// AI Recruiter OS: composition root. Wires config, database, services and routes into one HTTP server.
//   applicant -> careers page -> AI voice interview (Dograh) -> webhook -> scoring -> recruiter dashboard
// Run: node --experimental-sqlite server.js   (no npm dependencies)
import http from 'node:http';
import https from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadEnvFile, validateConfig, DOGRAH, envStr } from './lib/config.js';
import { createLogger } from './lib/logger.js';
import { openDatabase, runMigrations, json } from './lib/db.js';
import { HttpError, send, readJson, isReply, SECURITY_HEADERS, clientIp } from './lib/http.js';
import { metrics } from './lib/metrics.js';
import { MIGRATIONS } from './db/migrations.js';
import { scoreCandidate } from './scoring.js';
import { createLLM } from './llm.js';
import { createSuite, callAllowed } from './suite.js';
import { createSettings } from './settings.js';
import { seedDemo, seedFixtures } from './demo-seed.js';
import { createEngine, trace } from './engine.js';
import { createDograhClient } from './services/dograh.js';
import { createCandidateService } from './services/candidates.js';
import { createInterviewService } from './services/interviews.js';
import { createRelay } from './services/relay.js';
import { screeningContext, answersFromDograh } from './services/screening.js';
import { coreRoutes } from './routes/core.js';

export { screeningContext, answersFromDograh };

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(ROOT);
const log = createLogger({ base: { svc: 'recruiter-os' } });

const problems = validateConfig();
for (const p of problems) log[p.fatal ? 'error' : 'warn'](p.message, { key: p.key });
if (problems.some(p => p.fatal)) process.exit(1);

const PORT = Number(process.env.PORT || 4870);
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'recruiting.db');

// ---------------------------------------------------------------- database
export const db = openDatabase(DB_PATH);
const settings = createSettings(db, DB_PATH); // saved settings override .env and the environment
const applied = runMigrations(db, MIGRATIONS);
if (applied.length) log.info('database migrated', { versions: applied.join(',') });

// Demo data is opt-in: a production database must open clean, never with invented candidates or metrics.
if (process.env.SEED_DEMO_ROLES === '1' && !db.prepare('SELECT COUNT(*) n FROM jobs').get().n) {
  try { log.info('demo roles loaded', { roles: seedDemo(db, ROOT, process.env.BRAND_NAME || 'Your Company').join(', ') }); } catch (e) { log.error('could not load demo roles', { error: e }); }
}
if (process.env.SEED_DEMO_DATA === '1') seedFixtures(db);

// ---------------------------------------------------------------- services
const dograh = createDograhClient({ root: ROOT, db, settings, trace, log });
const candidates = createCandidateService(db);
const relay = createRelay({ trace });
let suite; // created below; services reach it through hooks() because the suite also depends on them
const hooks = () => suite;
const interviews = createInterviewService({ db, candidates, dograh, callAllowed, hooks, trace, log });
const llm = createLLM(db);
const engine = createEngine({ root: ROOT, DOGRAH, db, jobRow: candidates.jobRow, screeningContext, llmStatus: () => llm.status(), send, body: readJson, ready: { phone: () => DOGRAH.phoneReady, web: () => DOGRAH.webReady } });
suite = createSuite({
  db, send, body: readJson, J: json, jobRow: candidates.jobRow, candidateFull: candidates.full, logEvent: candidates.logEvent, addActivity: candidates.addActivity,
  rescore: cid => candidates.rescore(cid, 'suite'), latestAnswers: candidates.latestAnswers, scoreCandidate, screeningContext, llm,
  dograhCall: (agent, phone, ctx) => dograh.call(agent, phone, ctx),
  dograh: { roleAgent: dograh.roleAgent, syncRoleAgents: dograh.syncRoleAgents, phoneReady: () => DOGRAH.phoneReady, get agentUuid() { return DOGRAH.agentUuid; }, get refAgentUuid() { return DOGRAH.refAgentUuid; }, get reminderAgentUuid() { return DOGRAH.reminderAgentUuid; }, get rejectionAgentUuid() { return DOGRAH.rejectionAgentUuid; } },
  settings, dograhApi: (m, p, b) => dograh.api(m, p, b, { idempotent: m === 'GET' }), createAgents: dograh.createAgents, dograhCaps: dograh.caps,
});
const core = coreRoutes({ db, candidates, interviews, dograh, relay, hooks });

// ---------------------------------------------------------------- operational endpoints
const loopback = req => /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '') && !req.headers['cf-connecting-ip'];
function health() { return { ok: true, dograh: { phone: DOGRAH.phoneReady, web: DOGRAH.webReady } }; }
async function readiness() {
  const checks = {};
  try { db.prepare('SELECT 1').get(); checks.database = 'ok'; } catch (e) { checks.database = `error: ${e.message}`; }
  checks.dograh = DOGRAH.base ? ((await dograh.reachable()) ? 'ok' : 'unreachable') : 'not configured';
  checks.dograh_circuit = dograh.breaker.state;
  const ready = checks.database === 'ok';
  return { status: ready ? 200 : 503, body: { ready, checks, uptime_sec: Math.round(process.uptime()) } };
}
function metricsText() {
  const one = sql => db.prepare(sql).get().n;
  return metrics.render({
    candidates_total: one('SELECT COUNT(*) n FROM candidates'),
    screenings_in_progress: one("SELECT COUNT(*) n FROM screenings WHERE status='in_progress'"),
    tasks_pending: one("SELECT COUNT(*) n FROM tasks WHERE status='pending'"),
    tasks_failed: one("SELECT COUNT(*) n FROM tasks WHERE status='failed'"),
    process_resident_memory_bytes: process.memoryUsage().rss,
  });
}

// ---------------------------------------------------------------- static files
const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
async function serveStatic(res, p) {
  const f = p === '/' ? '/apply.html' : p === '/dashboard' ? '/dashboard.html' : p;
  const full = path.join(PUBLIC, path.normalize(f).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(PUBLIC + path.sep)) return false;
  const st = await stat(full).catch(() => null);
  if (!st?.isFile()) return false;
  const ext = path.extname(full);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300', ...SECURITY_HEADERS, ...(ext === '.html' ? { 'Content-Security-Policy': CSP } : {}) });
  res.end(await readFile(full));
  return true;
}

// ---------------------------------------------------------------- request pipeline
// Requests through a public tunnel (Cloudflare adds cf-connecting-ip) may only reach the webhook and health until a
// dashboard password is set; then the login gate protects candidate data and the careers page can be shared.
const tunnelAllowed = req => !req.headers['cf-connecting-ip'] || Boolean(process.env.ADMIN_PASSWORD);

async function dispatch(req, res, u, ctx) {
  const p = u.pathname, m = req.method;
  if (!tunnelAllowed(req) && !['/api/webhooks/dograh', '/api/health'].includes(p)) throw new HttpError(403, 'not available over the public tunnel');
  if (p.startsWith('/dograh/')) { ctx.route = '/dograh/*'; return proxyDograh(req, res, p.slice('/dograh'.length), u.search); }
  if (['/api/health', '/api/ready', '/metrics'].includes(p)) ctx.route = p;
  if (p === '/api/health') return send(res, 200, health());
  if (p === '/api/ready') { const r = await readiness(); return send(res, r.status, r.body); }
  if (p === '/metrics' && m === 'GET') {
    const tok = envStr('METRICS_TOKEN');
    if (!(loopback(req) || (tok && req.headers.authorization === `Bearer ${tok}`))) throw new HttpError(403, 'metrics are only served locally or with METRICS_TOKEN');
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' }); return res.end(metricsText());
  }
  if (await suite.route(req, res, u)) { ctx.route = 'suite'; return; }
  if (p.startsWith('/api/engine/') && (await engine(req, res, p, m)) !== false) { ctx.route = '/api/engine/*'; return; }

  const hit = core.match(m, p);
  if (hit) {
    ctx.route = hit.pattern;
    const body = m === 'POST' || m === 'PUT' ? (p === '/api/resume/pdf' ? null : await readJson(req)) : null;
    const out = await hit.handler({ req, res, params: hit.params, body: body || {}, query: u.searchParams, log: ctx.log });
    if (res.headersSent) return;
    return isReply(out) ? send(res, out.status, out.body, out.headers) : send(res, 200, out);
  }
  if (m === 'GET' && (await serveStatic(res, p))) { ctx.route = 'static'; return; }
  throw new HttpError(404, 'not found');
}

export const server = http.createServer(async (req, res) => {
  const started = performance.now();
  const requestId = String(req.headers['x-request-id'] || randomUUID()).slice(0, 64);
  res.setHeader('X-Request-Id', requestId);
  const ctx = { route: 'unmatched', log: log.child({ request_id: requestId }) };
  const u = new URL(req.url, 'http://x');
  try {
    await dispatch(req, res, u, ctx);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e instanceof SyntaxError ? 400 : 500;
    if (status >= 500) ctx.log.error('request failed', { method: req.method, path: u.pathname, error: e, stack: e.stack?.split('\n').slice(0, 4).join(' | ') });
    // In production, never leak internals: unexpected 5xx errors get a generic message (the log has the detail).
    const message = e instanceof HttpError ? e.message : status === 400 ? 'invalid JSON' : process.env.NODE_ENV === 'production' ? 'internal error' : e.message;
    send(res, status, { error: message, request_id: requestId, ...(e.details?.errors ? { errors: e.details.errors } : {}) });
  } finally {
    const record = () => {
      const seconds = (performance.now() - started) / 1000;
      metrics.inc('http_requests_total', { method: req.method, route: ctx.route, status: res.statusCode });
      metrics.observe('http_request_duration_seconds', { route: ctx.route }, seconds);
      ctx.log.debug('request', { method: req.method, path: u.pathname, route: ctx.route, status: res.statusCode, ms: Math.round(seconds * 1000), ip: clientIp(req) });
    };
    if (res.writableFinished) record(); else res.once('finish', record);
  }
});
server.requestTimeout = 60000;
server.headersTimeout = 20000;

// ---------------------------------------------------------------- Dograh browser-interview proxy
// The careers page reaches Dograh through this server (/dograh/...), so a candidate only needs this one address
// (for example a Cloudflare tunnel) and never Dograh itself. Only the public embed endpoints pass: Dograh's
// authenticated API is never exposed. Origin is rewritten to this server so Dograh's embed domain check passes.
const DOGRAH_PUBLIC_HTTP = /^\/api\/v1\/public\/embed\/(init|config\/[\w-]+|turn-credentials\/[\w-]+)$/;
const DOGRAH_PUBLIC_WS = /^\/api\/v1\/ws\/public\/signaling\/[\w-]+$/;
const dograhTarget = (rest, search, headers) => {
  const t = new URL(DOGRAH.base);
  return { lib: t.protocol === 'https:' ? https : http, opts: { hostname: t.hostname, port: t.port || (t.protocol === 'https:' ? 443 : 80), path: rest + search, headers: { ...headers, host: t.host, origin: `http://localhost:${PORT}` } } };
};
function proxyDograh(req, res, rest, search) {
  if (!DOGRAH.base || !DOGRAH_PUBLIC_HTTP.test(rest)) return send(res, 404, { error: 'not found' });
  const headers = {}; for (const k of ['content-type', 'content-length', 'accept']) if (req.headers[k]) headers[k] = req.headers[k];
  const { lib, opts } = dograhTarget(rest, search, headers);
  return new Promise(resolve => {
    const preq = lib.request({ ...opts, method: req.method, timeout: 15000 }, pres => {
      res.writeHead(pres.statusCode, { 'Content-Type': pres.headers['content-type'] || 'application/json', 'Cache-Control': 'no-store' });
      pres.pipe(res); pres.on('end', resolve);
    });
    preq.on('timeout', () => preq.destroy(new Error('timeout')));
    preq.on('error', () => { if (!res.headersSent) send(res, 502, { error: 'voice engine unreachable' }); else res.destroy(); resolve(); });
    req.pipe(preq);
  });
}
const sockets = new Set();
server.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, 'http://x');
  const rest = u.pathname.startsWith('/dograh/') ? u.pathname.slice('/dograh'.length) : '';
  if (!DOGRAH.base || !DOGRAH_PUBLIC_WS.test(rest) || !tunnelAllowed(req)) return socket.destroy();
  const headers = {}; for (const k of ['connection', 'upgrade', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol']) if (req.headers[k]) headers[k] = req.headers[k];
  const { lib, opts } = dograhTarget(rest, u.search, headers);
  const preq = lib.request({ ...opts, method: 'GET' });
  preq.on('upgrade', (pres, psock, phead) => {
    const lines = ['HTTP/1.1 101 Switching Protocols'];
    for (let i = 0; i < pres.rawHeaders.length; i += 2) lines.push(`${pres.rawHeaders[i]}: ${pres.rawHeaders[i + 1]}`);
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    if (phead.length) socket.write(phead);
    if (head.length) psock.write(head);
    psock.pipe(socket); socket.pipe(psock);
    sockets.add(socket);
    const close = () => { sockets.delete(socket); psock.destroy(); socket.destroy(); };
    psock.on('error', close); socket.on('error', close); psock.on('close', close); socket.on('close', close);
  });
  preq.on('response', pres => { socket.end(`HTTP/1.1 ${pres.statusCode} ${pres.statusMessage}\r\n\r\n`); });
  preq.on('error', () => socket.destroy());
  preq.end();
});

// ---------------------------------------------------------------- lifecycle
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const worker = suite.startWorker();
  server.listen(PORT, () => {
    // The test harness and start.mjs wait for this exact line.
    console.log(`Recruiting System on http://localhost:${PORT}  (dashboard: /dashboard)  Dograh phone:${DOGRAH.phoneReady} web:${DOGRAH.webReady}`);
  });
  // Graceful shutdown: stop taking work, let in-flight requests finish (max 10 s), close live interviews and the database.
  let stopping = false;
  const shutdown = signal => {
    if (stopping) return; stopping = true;
    log.info('shutting down', { signal, live_interviews: sockets.size });
    clearInterval(worker);
    const force = setTimeout(() => { log.warn('forced exit after 10 s'); process.exit(1); }, 10000);
    force.unref();
    server.close(() => { try { db.close(); } catch { /* already closed */ } process.exit(0); });
    server.closeIdleConnections?.();
    for (const s of sockets) s.end();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', e => log.error('unhandled rejection', { error: e }));
}
