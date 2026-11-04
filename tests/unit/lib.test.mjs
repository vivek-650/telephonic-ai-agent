// Unit tests for the infrastructure modules in lib/. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Router, readJson, HttpError, reply, isReply } from '../../lib/http.js';
import { object, str, email, num, oneOf } from '../../lib/validate.js';
import { retry, CircuitBreaker, isTransient } from '../../lib/resilience.js';
import { createRateLimiter } from '../../lib/rate-limit.js';
import { createMetrics } from '../../lib/metrics.js';
import { runMigrations, transaction, json } from '../../lib/db.js';
import { issueSession, verifySession } from '../../lib/session.js';
import { redact, createLogger } from '../../lib/logger.js';
import { validateConfig } from '../../lib/config.js';

test('router matches params and method', () => {
  const r = new Router().post('/api/candidates/:id/stage', () => 1).get('/api/candidates/:id', () => 2);
  assert.deepEqual(r.match('POST', '/api/candidates/abc-1/stage').params, { id: 'abc-1' });
  assert.equal(r.match('GET', '/api/candidates/abc-1/stage'), null);
  assert.equal(r.match('GET', '/api/candidates/../x'), null, 'params never match path separators or dots');
});

test('readJson enforces size and syntax', async () => {
  const body = s => (async function* () { yield Buffer.from(s); })();
  assert.deepEqual(await readJson(body('{"a":1}')), { a: 1 });
  assert.deepEqual(await readJson(body('  ')), {});
  await assert.rejects(readJson(body('{bad')), e => e instanceof HttpError && e.status === 400);
  await assert.rejects(readJson(body('x'.repeat(20)), 10), e => e.status === 413);
});

test('reply is distinguishable from data that has a status field', () => {
  assert.equal(isReply(reply(201, {})), true);
  assert.equal(isReply({ status: 201, body: {} }), false);
});

test('schema validator coerces and reports every error', () => {
  const S = object({ name: str({ max: 5 }), email: email(), years: num({ min: 0, max: 60 }), mode: oneOf(['a', 'b'], { optional: true, fallback: 'a' }) });
  const ok = S.parse({ name: '  Riya Sharma ', email: 'r@x.io', years: '3' });
  assert.deepEqual(ok.value, { name: 'Riya ', email: 'r@x.io', years: 3, mode: 'a' });
  const bad = S.parse({ email: 'nope', years: 'abc', mode: 'z' });
  assert.deepEqual(bad.errors, ['name is required', 'email is invalid', 'years must be a number', 'mode must be one of a, b']);
  assert.equal(S.parse(null).ok, false, 'non-object input is handled');
});

test('retry backs off on transient errors only', async () => {
  let n = 0;
  assert.equal(await retry(async () => { if (++n < 3) throw Object.assign(new Error('x'), { status: 503 }); return 'ok'; }, { baseMs: 1 }), 'ok');
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(retry(async () => { n++; throw Object.assign(new Error('bad'), { status: 400 }); }, { baseMs: 1 }));
  assert.equal(n, 1, '4xx is not retried');
  assert.equal(isTransient(Object.assign(new Error('x'), { name: 'TimeoutError' })), true);
});

test('circuit breaker opens, fails fast, then recovers through half-open', async () => {
  let t = 0;
  const b = new CircuitBreaker('dep', { threshold: 2, cooldownMs: 1000, now: () => t });
  const boom = () => Promise.reject(Object.assign(new Error('down'), { status: 502 }));
  await assert.rejects(b.run(boom)); await assert.rejects(b.run(boom));
  assert.equal(b.state, 'open');
  let called = false;
  await assert.rejects(b.run(async () => { called = true; }), /circuit open/);
  assert.equal(called, false, 'open circuit does not call the dependency');
  t = 1500;
  assert.equal(await b.run(async () => 'up'), 'up');
  assert.equal(b.state, 'closed');
  await assert.rejects(b.run(() => Promise.reject(Object.assign(new Error('bad input'), { status: 400 }))));
  assert.equal(b.failures, 0, 'client errors do not trip the breaker');
});

test('rate limiter refills over time and evicts old keys', () => {
  let t = 0;
  const l = createRateLimiter({ capacity: 2, refillPerSec: 1, maxKeys: 2, now: () => t });
  assert.ok(l.take('a').ok); assert.ok(l.take('a').ok);
  const no = l.take('a'); assert.equal(no.ok, false); assert.equal(no.retryAfterSec, 1);
  t = 1000; assert.ok(l.take('a').ok);
  l.take('b'); l.take('c'); assert.equal(l.size(), 2);
});

test('metrics render Prometheus text', () => {
  const m = createMetrics();
  m.inc('hits_total', { route: '/x' }); m.inc('hits_total', { route: '/x' }); m.observe('lat_seconds', { route: '/x' }, 0.03);
  const out = m.render({ up: 1 });
  assert.match(out, /hits_total\{route="\/x"\} 2/); assert.match(out, /lat_seconds_bucket\{route="\/x",le="0.05"\} 1/); assert.match(out, /up 1/);
  assert.equal(m.value('hits_total', { route: '/x' }), 2);
});

test('migrations run once, in order, and roll back on failure', () => {
  const db = new DatabaseSync(':memory:');
  const M = [{ version: 1, name: 'a', up: d => d.exec('CREATE TABLE a (x)') }, { version: 2, name: 'b', up: d => d.exec('CREATE TABLE b (x)') }];
  assert.deepEqual(runMigrations(db, M), [1, 2]);
  assert.deepEqual(runMigrations(db, M), []);
  assert.throws(() => runMigrations(db, [...M, { version: 3, name: 'bad', up: d => { d.exec('CREATE TABLE c (x)'); throw new Error('boom'); } }]));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='c'").get().n, 0, 'failed migration left nothing behind');
  assert.throws(() => runMigrations(db, [M[1], M[0]]), /out of order/);
  assert.equal(transaction(db, () => transaction(db, () => 7)), 7, 'nested transactions join the outer one');
  assert.deepEqual(json('{bad', []), []);
});

test('sessions are signed, expire, and die when the password changes', () => {
  const cfg = { secret: 's3cret', password: 'correct-horse' };
  const tok = issueSession({ ...cfg, ttlSec: 60, now: 0 });
  assert.equal(verifySession(tok, { ...cfg, now: 1000 }), true);
  assert.equal(verifySession(tok, { ...cfg, now: 61000 }), false, 'expired');
  assert.equal(verifySession(tok, { ...cfg, password: 'new-password', now: 1000 }), false, 'password rotated');
  assert.equal(verifySession(tok.slice(0, -2) + 'xx', { ...cfg, now: 1000 }), false, 'tampered');
  assert.equal(verifySession('', cfg), false);
});

test('logger redacts secrets and personal data', () => {
  const r = redact({ api_key: 'dgr_123', nested: { password: 'p' }, note: 'call +91 98765 43210 or a@b.com' });
  assert.equal(r.api_key, '[redacted]'); assert.equal(r.nested.password, '[redacted]');
  assert.equal(r.note, 'call [phone] or [email]');
  const lines = []; createLogger({ format: 'json', write: l => lines.push(l) }).info('hi', { token: 'x' });
  assert.equal(JSON.parse(lines[0]).token, '[redacted]');
});

test('config validation flags fatal and risky settings', () => {
  const p = validateConfig({ PORT: '99999', DOGRAH_BASE_URL: 'localhost:8000', ADMIN_PASSWORD: 'short', PUBLIC_BASE_URL: 'https://x.io' });
  assert.ok(p.find(x => x.key === 'PORT').fatal); assert.ok(p.find(x => x.key === 'DOGRAH_BASE_URL').fatal);
  assert.equal(p.find(x => x.key === 'WEBHOOK_SECRET').fatal, false);
  assert.deepEqual(validateConfig({}), []);
});
