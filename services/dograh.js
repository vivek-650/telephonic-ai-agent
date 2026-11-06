// Dograh (voice engine) client: authenticated API calls with timeouts, retries and a
// circuit breaker, agent provisioning, per-role voice agents and run look-ups.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DOGRAH, envStr, envNum } from '../lib/config.js';
import { retry, CircuitBreaker } from '../lib/resilience.js';
import { metrics } from '../lib/metrics.js';
import { json } from '../lib/db.js';

/** A Dograh HTTP failure that carries the status, so retry and the breaker can classify it. */
export class DograhError extends Error {
  constructor(status, message) { super(message); this.name = 'DograhError'; this.status = status; }
}

const AGENT_KINDS = {
  screener: { uuid: () => DOGRAH.agentUuid, wid: () => DOGRAH.workflowId, cfg: { max_call_duration: 900, max_user_idle_timeout: 15 }, uuidCol: 'agent_uuid', widCol: 'agent_wid', label: 'Screener', file: 'workflow.json', suffix: 'Recruiting Screener', uuidKey: 'DOGRAH_AGENT_UUID', widKey: 'DOGRAH_WORKFLOW_ID' },
  rejection: { uuid: () => DOGRAH.rejectionAgentUuid, wid: () => DOGRAH.rejectionWorkflowId, cfg: { max_call_duration: 480, max_user_idle_timeout: 15 }, uuidCol: 'rej_agent_uuid', widCol: 'rej_wid', label: 'Rejection', file: 'rejection-workflow.json', suffix: 'Rejection Call', uuidKey: 'DOGRAH_REJECTION_AGENT_UUID', widKey: 'DOGRAH_REJECTION_WORKFLOW_ID' },
};

/**
 * @param {{ root: string, db: import('node:sqlite').DatabaseSync, settings: { put(k: string, v: any): void }, trace: (kind: string, detail: object) => void, log: any }} deps
 */
export function createDograhClient({ root, db, settings, trace, log }) {
  const breaker = new CircuitBreaker('dograh', { threshold: envNum('DOGRAH_BREAKER_THRESHOLD', 5), cooldownMs: envNum('DOGRAH_BREAKER_COOLDOWN_MS', 30000) });

  /** One HTTP call. Throws DograhError with Dograh's own detail message on failure. */
  async function raw(method, p, body, { timeoutMs = 30000, auth = true } = {}) {
    const r = await fetch(`${DOGRAH.base}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { 'X-API-Key': DOGRAH.apiKey } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const t = await r.text();
    const d = json(t, { detail: t });
    if (!r.ok) {
      const detail = typeof d?.detail === 'string' ? d.detail : JSON.stringify(d?.detail || d);
      throw new DograhError(r.status, `Dograh ${method} ${p} failed (${r.status}): ${detail}`.slice(0, 300));
    }
    return d;
  }

  /**
   * Authenticated API call through the breaker. Reads are retried on transient failures;
   * writes are not (`idempotent: false`), because Dograh may have acted on the first attempt.
   */
  async function api(method, p, body, { idempotent = method === 'GET', timeoutMs } = {}) {
    const started = performance.now();
    try {
      const v = await breaker.run(() => retry(() => raw(method, p, body, { timeoutMs }), {
        attempts: idempotent ? 3 : 1,
        onRetry: (e, n, ms) => log.warn('dograh retry', { method, path: p, attempt: n, delay_ms: Math.round(ms), error: e.message }),
      }));
      metrics.inc('dograh_requests_total', { method, outcome: 'ok' });
      return v;
    } catch (e) {
      metrics.inc('dograh_requests_total', { method, outcome: e.name === 'CircuitOpenError' ? 'circuit_open' : 'error' });
      throw e;
    } finally {
      metrics.observe('dograh_request_duration_seconds', { method }, (performance.now() - started) / 1000);
    }
  }

  /** Create the screening and rejection agents in Dograh and save their ids (what `npm run setup:dograh` does). */
  async function createAgents({ force = false } = {}) {
    if (!DOGRAH.base || !DOGRAH.apiKey) throw new Error('Save the Dograh address and API key first.');
    const pub = envStr('PUBLIC_BASE_URL').replace(/\/+$/, '');
    if (!pub) throw new Error('Save this server\'s public address first: Dograh posts call results back to it.');
    const brand = envStr('BRAND_NAME') ? `${envStr('BRAND_NAME')} ` : '';
    const result = [];
    for (const k of Object.values(AGENT_KINDS)) {
      if (!force && envStr(k.uuidKey)) { result.push({ agent: k.suffix, status: 'already set up' }); continue; }
      const file = path.join(root, 'dograh', k.file);
      if (!existsSync(file)) throw new Error(`Missing ${k.file} in the dograh folder.`);
      const wf = JSON.parse(readFileSync(file, 'utf8'));
      for (const n of wf.nodes) if (n.type === 'webhook') n.data.endpoint_url = `${pub}/api/webhooks/dograh`;
      const name = `${brand}${k.suffix}`;
      const created = await api('POST', '/api/v1/workflow/create/definition', { name, workflow_definition: wf });
      const uuid = await publish(created.id, name, wf, k.cfg) || created.workflow_uuid;
      if (!uuid) throw new Error(`Created "${name}" but Dograh did not return its ID. Copy it from the Dograh dashboard.`);
      settings.put(k.uuidKey, uuid); settings.put(k.widKey, created.id);
      result.push({ agent: k.suffix, status: 'created', name, id: created.id });
    }
    return result;
  }

  /** Draft, save and publish a workflow definition. Returns its uuid. */
  async function publish(wid, name, definition, configs) {
    await api('POST', `/api/v1/workflow/${wid}/create-draft`, null, { idempotent: false }).catch(() => {}); // no draft needed is fine
    await api('PUT', `/api/v1/workflow/${wid}`, { name, workflow_definition: definition, workflow_configurations: configs }, { idempotent: true });
    await api('POST', `/api/v1/workflow/${wid}/publish`, null, { idempotent: false }).catch(e => { if (!/No draft to publish/i.test(String(e.message))) throw e; });
    return (await api('GET', `/api/v1/workflow/fetch/${wid}`)).workflow_uuid;
  }

  // What this Dograh supports. Standard Dograh has one voice for everything; the voice-engine build adds per-agent voices.
  let capCache = { at: 0, v: null };
  async function caps(force = false) {
    const ttl = envNum('DOGRAH_CAPS_TTL_MS', 600000);
    if (!force && capCache.v && Date.now() - capCache.at < ttl) return capCache.v;
    const c = { reachable: false, version: null, voice_override: false };
    if (DOGRAH.base) {
      try { const h = await raw('GET', '/api/v1/health', null, { timeoutMs: 6000, auth: false }); c.reachable = true; c.version = h.version || null; } catch { /* unreachable */ }
      if (c.reachable && DOGRAH.apiKey) { try { await raw('GET', '/api/v1/user/configurations/voices/realtime-catalog'); c.voice_override = true; } catch { /* standard build */ } }
    }
    capCache = { at: Date.now(), v: c };
    return c;
  }

  async function reachable(timeoutMs = 2500) {
    if (!DOGRAH.base) return false;
    try { await raw('GET', '/api/v1/health', null, { timeoutMs, auth: false }); return true; } catch { return false; }
  }

  /**
   * The Dograh agent for this role. No voice = the shared default agent. A voice = a copy of the
   * default agent with that voice, rebuilt when the default agent or the voice changes (content hash).
   * Never blocks a call: any failure falls back to the default agent.
   */
  async function roleAgent(job, kind = 'screener') {
    const K = AGENT_KINDS[kind], voice = String(job.voice || '').trim();
    if (!voice || !K.wid() || !K.uuid()) return K.uuid();
    if (!(await caps()).voice_override) return K.uuid();
    try {
      const base = await api('GET', `/api/v1/workflow/fetch/${K.wid()}`);
      const def = structuredClone(base.workflow_definition);
      for (const n of def.nodes) if (n.type === 'trigger' && n.data) delete n.data.trigger_path;
      const hash = createHash('sha256').update(JSON.stringify(def) + '|' + voice).digest('hex').slice(0, 16);
      const row = db.prepare('SELECT agent_sync, agent_uuid, agent_wid, rej_agent_uuid, rej_wid FROM jobs WHERE id=?').get(job.id) || {};
      const sync = json(row.agent_sync, {});
      let uuid = row[K.uuidCol], wid = row[K.widCol];
      if (uuid && wid && sync[kind] === hash) return uuid;
      const name = `${job.title} (${voice}) ${K.label}`.slice(0, 80);
      if (!wid) wid = (await api('POST', '/api/v1/workflow/create/definition', { name, workflow_definition: def })).id;
      const published = await publish(wid, name, def, { ...K.cfg, model_voice_override: { voice } });
      uuid = uuid || published;
      sync[kind] = hash;
      db.prepare(`UPDATE jobs SET ${K.uuidCol}=?, ${K.widCol}=?, agent_sync=? WHERE id=?`).run(uuid, wid, JSON.stringify(sync), job.id);
      trace('role_agent_synced', { job: job.id, kind, voice, workflow: wid });
      return uuid;
    } catch (e) {
      trace('role_agent_failed', { job: job.id, kind, voice, error: String(e.message || e).slice(0, 200) });
      return K.uuid();
    }
  }
  async function syncRoleAgents(job) { const a = await roleAgent(job, 'screener'); if (DOGRAH.rejectionAgentUuid) await roleAgent(job, 'rejection'); return a; }

  /** Place an outbound call. Not retried: a retry after a timeout could ring the candidate twice. */
  async function call(agentUuid, phone, initialContext) {
    try {
      return await api('POST', `/api/v1/public/agent/workflow/${encodeURIComponent(agentUuid)}`, { phone_number: phone, initial_context: initialContext }, { idempotent: false });
    } catch (e) {
      throw new DograhError(e.status || 502, String(e.message).replace(/^Dograh POST \S+ failed/, 'Dograh call failed'));
    }
  }

  /** The finished run as Dograh recorded it: real transcript and duration. Null when unavailable. */
  async function fetchRun(workflowId, runId) {
    try { return await api('GET', `/api/v1/workflow/${encodeURIComponent(String(workflowId))}/runs/${encodeURIComponent(runId)}`, null, { timeoutMs: 8000 }); }
    catch (e) { trace('dograh_run_fetch_failed', { run_id: runId, error: String(e.message || e).slice(0, 120) }); return null; }
  }

  return { api, createAgents, caps, reachable, roleAgent, syncRoleAgents, call, fetchRun, breaker };
}
