// The interview lifecycle: start a screen (phone, browser or simulator), finish a simulator
// screen, and turn Dograh's result webhook into a scored, audited interview.
//
//   applied ──start──► screening(in_progress) ──webhook──► completed ──rescore──► shortlisted | review | rejected
//                                            └─────────► incomplete (no conversation / under 15 s)
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { QUESTIONS, parseAnswer } from '../scoring.js';
import { HttpError, notFound, badRequest, conflict } from '../lib/http.js';
import { DOGRAH, envNum } from '../lib/config.js';
import { json, transaction } from '../lib/db.js';
import { metrics } from '../lib/metrics.js';
import { screeningContext, parseWebhook, answersFromDograh, transcriptFromDograh, transcriptFromRun, isIncomplete } from './screening.js';

export const MODES = ['phone', 'web', 'simulator'];

const safeEqual = (a, b) => {
  const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
};

/**
 * @param {{ db: import('node:sqlite').DatabaseSync, candidates: ReturnType<import('./candidates.js').createCandidateService>,
 *   dograh: ReturnType<import('./dograh.js').createDograhClient>, callAllowed: (phone: string) => boolean,
 *   hooks: () => { afterScreen(cid: string): void, referenceWebhook(b: object): Promise<object>, rejectionWebhook(b: object): Promise<object> },
 *   trace: Function, log: any }} deps
 */
export function createInterviewService({ db, candidates, dograh, callAllowed, hooks, trace, log }) {
  const insertScreening = db.prepare("INSERT INTO screenings (id,candidate_id,mode,status,run_id,transcript,answers) VALUES (?,?,?,'in_progress',?,'[]','{}')");

  async function start(cid, mode) {
    const c = candidates.get(cid);
    if (!c) throw notFound('candidate');
    if (!MODES.includes(mode)) throw badRequest('mode must be phone, web or simulator');
    let runId = null;
    if (mode === 'phone') {
      if (!DOGRAH.phoneReady) throw conflict('Dograh phone screening is not configured (DOGRAH_BASE_URL, DOGRAH_API_KEY, DOGRAH_AGENT_UUID).');
      // The public form must never ring strangers: consent, the allowlist (until production), and no repeat calls.
      if (!c.consent_at) throw new HttpError(403, 'We need your consent to call you. Please tick the consent box on the application form.');
      if (!callAllowed(c.phone)) throw conflict('Phone screening is limited to approved numbers in this demo. Ask the team to add your number.');
      if (db.prepare("SELECT 1 FROM screenings WHERE candidate_id=? AND mode='phone' AND started_at > datetime('now','-10 minutes')").get(cid)) {
        throw new HttpError(429, 'A call to this number was just started. Please wait a few minutes before trying again.');
      }
      const job = candidates.jobRow(c.job_id);
      const ctx = screeningContext(c, job);
      const agent = await dograh.roleAgent(job, 'screener');
      try {
        const r = await dograh.call(agent, c.phone, ctx);
        trace('dograh_call_out', { to: c.name, agent, ok: true, run_id: r.workflow_run_id, context_keys: Object.keys(ctx) });
        runId = String(r.workflow_run_id);
      } catch (e) {
        trace('dograh_call_out', { to: c.name, agent, ok: false, error: e.message, context_keys: Object.keys(ctx) });
        candidates.logEvent(cid, 'error', e.message);
        metrics.inc('screenings_total', { mode, outcome: 'trigger_failed' });
        throw new HttpError(502, e.message);
      }
    }
    if (mode === 'web' && !DOGRAH.webReady) throw conflict('Dograh web widget is not configured (DOGRAH_BASE_URL, DOGRAH_EMBED_TOKEN).');
    const sid = randomUUID();
    transaction(db, () => {
      insertScreening.run(sid, cid, mode, runId);
      db.prepare("UPDATE candidates SET stage='screening' WHERE id=?").run(cid);
      candidates.logEvent(cid, 'screening_started', `${mode} screening started${runId ? ` (Dograh run ${runId})` : ''}`);
    });
    metrics.inc('screenings_total', { mode, outcome: 'started' });
    return { screening_id: sid, run_id: runId, questions: mode === 'simulator' ? QUESTIONS : undefined };
  }

  /** Simulator answers (typed on the careers page when no voice engine is set up). */
  function completeSimulator(sid, b) {
    const s = db.prepare('SELECT * FROM screenings WHERE id=?').get(sid);
    if (!s) throw notFound('screening');
    if (s.status === 'completed') throw conflict('screening already completed');
    // A public endpoint: it must never let anyone overwrite a real voice interview with typed answers.
    if (s.mode !== 'simulator') throw new HttpError(403, 'only simulator screenings can be completed here');
    const transcript = Array.isArray(b.transcript) ? b.transcript.slice(0, 200) : [];
    const answers = {};
    for (const q of QUESTIONS) {
      const raw = b.answers?.[q.key];
      if (raw !== undefined && raw !== '') answers[q.key] = parseAnswer(q, String(raw).slice(0, 4000));
    }
    const score = transaction(db, () => {
      db.prepare("UPDATE screenings SET status='completed', transcript=?, answers=?, ended_at=datetime('now') WHERE id=?").run(JSON.stringify(transcript), JSON.stringify(answers), s.id);
      candidates.logEvent(s.candidate_id, 'screening_completed', `${s.mode} screening completed`);
      const r = candidates.rescore(s.candidate_id, 'simulator');
      candidates.logEvent(s.candidate_id, 'scored', `${r.total}/100, ${r.verdict}`);
      return r;
    });
    metrics.inc('screenings_total', { mode: 'simulator', outcome: 'completed' });
    hooks().afterScreen(s.candidate_id);
    return { score };
  }

  /** Dograh's end-of-call webhook. Returns `{ status, body }`. Safe to deliver more than once. */
  async function handleWebhook(rawBody, headers) {
    if (DOGRAH.webhookSecret && !safeEqual(headers['x-webhook-secret'] || '', DOGRAH.webhookSecret)) {
      metrics.inc('webhooks_total', { outcome: 'unauthorized' });
      return { status: 401, body: { error: 'bad secret' } };
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(rawBody)).digest('hex').slice(0, 32);
    const { body: b, ic, runId } = parseWebhook(rawBody, headers);
    trace('dograh_webhook_in', { candidate_id: ic.candidate_id || null, run_id: runId, turns: Array.isArray(b.transcript) ? b.transcript.length : 0, gathered: Object.keys(b.gathered_context || b.extracted_variables || {}) });
    if (ic.kind === 'reference') return { status: 200, body: await hooks().referenceWebhook(b) };
    if (ic.kind === 'rejection') return { status: 200, body: await hooks().rejectionWebhook(b) };

    let s = runId ? db.prepare('SELECT * FROM screenings WHERE run_id=?').get(runId) : null;
    const cid = s?.candidate_id || ic.candidate_id || b.candidate_id;
    if (!candidates.exists(cid)) {
      metrics.inc('webhooks_total', { outcome: 'unknown_candidate' });
      return { status: 404, body: { error: 'no matching candidate for this run' } };
    }

    // Retried delivery of the exact same result: answer as before, do not score or notify twice.
    const key = `${cid}:${fingerprint}`;
    const seen = db.prepare('SELECT outcome FROM webhook_deliveries WHERE key=?').get(key);
    if (seen) {
      metrics.inc('webhooks_total', { outcome: 'duplicate' });
      const sc = db.prepare('SELECT total, verdict FROM scores WHERE candidate_id=?').get(cid);
      return { status: 200, body: { ok: true, duplicate: true, candidate_id: cid, incomplete: seen.outcome === 'incomplete' || undefined, score: sc || undefined } };
    }

    if (!s) s = db.prepare("SELECT * FROM screenings WHERE candidate_id=? AND mode='web' AND status='in_progress' ORDER BY started_at DESC").get(cid);
    if (!s) {
      const sid = randomUUID();
      insertScreening.run(sid, cid, ic.source === 'web' ? 'web' : 'phone', runId || null);
      s = db.prepare('SELECT * FROM screenings WHERE id=?').get(sid);
    }

    // Re-read the run from Dograh itself: the real transcript and duration, not blind trust in the posted payload.
    let durationSec = null;
    if (runId && DOGRAH.base && DOGRAH.apiKey) {
      const run = await dograh.fetchRun(b.workflow_id || envNum('DOGRAH_WORKFLOW_ID', 1), runId);
      if (run) {
        durationSec = run?.cost_info?.call_duration_seconds ?? null;
        const turns = transcriptFromRun(run);
        if (turns.length) b.transcript = turns;
      }
    }
    const answers = answersFromDograh(b);
    const transcript = transcriptFromDograh(b);
    answers.evidence_text = transcript.filter(t => t.role === 'candidate').map(t => t.text).join(' ').slice(0, 8000);
    const incomplete = isIncomplete(transcript, durationSec);
    const outcome = incomplete ? 'incomplete' : 'completed';

    const score = transaction(db, () => {
      db.prepare(`UPDATE screenings SET status=?, run_id=COALESCE(run_id,?), transcript=?, answers=?, raw=?, duration_sec=?, failure_reason=?,
          ended_at=${durationSec !== null ? "datetime(started_at, '+' || CAST(? AS INTEGER) || ' seconds')" : "datetime('now')"} WHERE id=?`)
        .run(outcome, runId || null, JSON.stringify(transcript), JSON.stringify(answers), JSON.stringify(b).slice(0, 200000), durationSec,
          incomplete ? (durationSec !== null && durationSec < 15 ? 'too_short' : 'candidate_silent') : null, ...(durationSec !== null ? [durationSec] : []), s.id);
      db.prepare('INSERT INTO webhook_deliveries (key, candidate_id, outcome) VALUES (?,?,?)').run(key, cid, outcome);
      if (incomplete) {
        candidates.logEvent(cid, 'screening_incomplete', `Dograh ${s.mode} screening ended without a conversation${runId ? ` (run ${runId})` : ''}`);
        return null;
      }
      candidates.logEvent(cid, 'screening_completed', `Dograh ${s.mode} screening completed${runId ? ` (run ${runId})` : ''}`);
      const r = candidates.rescore(cid, `webhook:${s.mode}`);
      candidates.logEvent(cid, 'scored', `${r.total}/100, ${r.verdict}`);
      return r;
    });
    metrics.inc('screenings_total', { mode: s.mode, outcome });
    metrics.inc('webhooks_total', { outcome });
    log.info('interview finished', { candidate_id: cid, mode: s.mode, outcome, run_id: runId, duration_sec: durationSec, score: score?.total, verdict: score?.verdict });
    if (incomplete) return { status: 200, body: { ok: true, candidate_id: cid, incomplete: true } };
    hooks().afterScreen(cid);
    return { status: 200, body: { ok: true, candidate_id: cid, score } };
  }

  /** A browser interview by this candidate started in the last `minutes`: gate for handing out relay credentials. */
  const liveWebInterview = (cid, minutes = 30) => Boolean(cid && db.prepare(`SELECT 1 FROM screenings WHERE candidate_id=? AND mode='web' AND started_at > datetime('now','-${Number(minutes) | 0} minutes')`).get(String(cid)));

  return { start, completeSimulator, handleWebhook, liveWebInterview };
}
