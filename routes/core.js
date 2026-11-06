// Core HTTP routes: careers page, interviews, candidates, recruiters and reporting.
// Handlers are thin: validate input, call a service, shape the response.
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { QUESTIONS, CRITERIA } from '../scoring.js';
import { Router, HttpError, notFound, badRequest, readRaw, reply } from '../lib/http.js';
import { object, str, email, phone, num, oneOf } from '../lib/validate.js';
import { DOGRAH } from '../lib/config.js';
import { json, transaction } from '../lib/db.js';
import { screeningContext } from '../services/screening.js';
import { STAGES } from '../services/candidates.js';
import { MODES } from '../services/interviews.js';

const run = promisify(execFile);

export const ApplicationSchema = object({
  job_id: str({ max: 64 }), name: str({ max: 120 }), email: email(), phone: phone(), city: str({ max: 80 }),
  years: num({ min: 0, max: 60 }), notice_days: num({ min: 0, max: 365 }), expected_salary: num({ min: 0, max: 1e8 }),
  skills: str({ optional: true, min: 0, max: 2000 }), why: str({ optional: true, min: 0, max: 4000 }),
  resume: str({ optional: true, min: 0, max: 20000 }), source: str({ optional: true, min: 0, max: 40 }),
  consent: v => v === true || v === 'true' || v === 'on', // explicit opt-in only
});

/** Indian 10-digit numbers get +91; anything with a + is kept as given. */
export const e164 = p => { const d = String(p).replace(/[^\d+]/g, ''); return d.startsWith('+') ? d : d.length === 10 ? `+91${d}` : `+${d}`; };

/**
 * @param {{ db: import('node:sqlite').DatabaseSync, candidates: any, interviews: any, dograh: any, relay: any, hooks: () => any }} deps
 */
export function coreRoutes({ db, candidates, interviews, dograh, relay, hooks }) {
  const r = new Router();
  const recruiterOk = rid => !rid || db.prepare('SELECT id FROM recruiters WHERE id=?').get(rid);
  const requireCandidate = id => { if (!candidates.exists(id)) throw notFound('candidate'); };

  r.get('/api/config', async () => ({
    careers_url: process.env.CAREERS_URL || '', brand: process.env.BRAND_NAME || 'Hirevox', agent_name: process.env.AGENT_NAME || 'Priya',
    dograh_web: DOGRAH.webReady, dograh_phone: DOGRAH.phoneReady, dograh_api_live: await dograh.reachable(), dograh_base: DOGRAH.base || null,
    embed_token: DOGRAH.webReady ? DOGRAH.embedToken : null, questions: QUESTIONS, criteria: CRITERIA,
  }));

  r.get('/api/jobs', () => db.prepare('SELECT id FROM jobs ORDER BY created_at').all().map(x => candidates.jobRow(x.id)));

  r.post('/api/applications', async ({ body: b }) => {
    const { value: v, errors } = ApplicationSchema.parse(b);
    if (v.job_id && !candidates.jobRow(v.job_id)) errors.push('job not found');
    if (errors.length) throw badRequest(errors.join('; '), { errors });
    const id = randomUUID();
    const job = candidates.jobRow(v.job_id);
    transaction(db, () => {
      db.prepare(`INSERT INTO candidates (id,job_id,name,email,phone,city,years,notice_days,expected_salary,skills,why,source,resume_text,consent_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, v.job_id, v.name, v.email, e164(v.phone), v.city, v.years, v.notice_days, v.expected_salary, v.skills || '', v.why || '',
          v.source || 'careers', v.resume || null, v.consent ? new Date().toISOString() : null);
      candidates.logEvent(id, 'applied', `Applied for ${job.title}`);
      candidates.rescore(id, 'applied');
    });
    hooks().afterApply(id);
    return reply(201, { id, context: screeningContext(candidates.get(id), job) });
  });

  // PDF resume -> plain text with pdftotext (async, so a slow PDF never blocks other requests). Max 5 MB.
  r.post('/api/resume/pdf', async ({ req }) => {
    const buf = await readRaw(req, 5e6, 'PDF too large (max 5 MB)');
    if (buf.length < 100 || buf.subarray(0, 5).toString() !== '%PDF-') throw badRequest('that file is not a PDF');
    const tmp = path.join(tmpdir(), `resume-${randomUUID()}.pdf`);
    await writeFile(tmp, buf);
    let text;
    try {
      const bin = existsSync('/opt/homebrew/bin/pdftotext') ? '/opt/homebrew/bin/pdftotext' : 'pdftotext';
      ({ stdout: text } = await run(bin, ['-layout', tmp, '-'], { encoding: 'utf8', timeout: 15000, maxBuffer: 8e6 }));
    } catch { throw new HttpError(500, 'could not read this PDF (pdftotext failed or is not installed)'); }
    finally { await unlink(tmp).catch(() => {}); }
    text = text.replace(/\f/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 40) throw new HttpError(422, 'no readable text in this PDF (scanned image?). Paste the text instead.');
    return { text: text.slice(0, 20000), truncated: text.length > 20000 };
  });

  // TURN relay for browser interviews, only for a candidate with a browser interview started in the last 30 minutes.
  r.post('/api/public/ice', async ({ body }) => {
    if (!interviews.liveWebInterview(body.candidate_id)) throw new HttpError(403, 'no browser interview in progress');
    return { ice_servers: await relay.iceServers() };
  });

  r.post('/api/candidates/:id/screenings', async ({ params, body }) => {
    const { value, errors } = object({ mode: oneOf(MODES, { optional: true, fallback: 'simulator' }) }).parse(body);
    if (errors.length) throw badRequest('mode must be phone, web or simulator');
    return reply(201, await interviews.start(params.id, value.mode));
  });
  r.post('/api/screenings/:id/complete', ({ params, body }) => interviews.completeSimulator(params.id, body));
  r.post('/api/webhooks/dograh', async ({ req, body }) => { const out = await interviews.handleWebhook(body, req.headers); return reply(out.status, out.body); });

  r.get('/api/candidates', () => {
    const rows = db.prepare(`SELECT c.*, j.title job_title, s.total, s.verdict, s.flags,
      (SELECT helpful FROM feedback f WHERE f.candidate_id=c.id ORDER BY created_at DESC LIMIT 1) helpful
      FROM candidates c JOIN jobs j ON j.id=c.job_id LEFT JOIN scores s ON s.candidate_id=c.id ORDER BY c.created_at DESC`).all();
    return rows.map(x => { const e = candidates.evaluationFor(x); return { ...x, flags: json(x.flags, []), blocker: e.blocker, outliers: e.outliers }; });
  });
  r.get('/api/candidates/:id', ({ params }) => { const c = candidates.full(params.id); if (!c) throw notFound('candidate'); return c; });
  r.get('/api/candidates/:id/score-history', ({ params }) => {
    requireCandidate(params.id);
    return db.prepare('SELECT * FROM score_audit WHERE candidate_id=? ORDER BY id DESC').all(params.id).map(x => ({ ...x, breakdown: json(x.breakdown, []) }));
  });

  r.post('/api/candidates/:id/stage', ({ params, body: { stage, recruiter_id } }) => {
    if (!recruiterOk(recruiter_id)) throw badRequest('unknown recruiter');
    if (!STAGES.includes(stage)) throw badRequest(`stage must be one of ${STAGES.join(', ')}`);
    if (!db.prepare('UPDATE candidates SET stage=? WHERE id=?').run(stage, params.id).changes) throw notFound('candidate');
    candidates.logEvent(params.id, 'stage', `Moved to ${stage}`);
    candidates.addActivity(params.id, recruiter_id, 'stage', `Moved to ${stage}`);
    return { ok: true };
  });

  // Human-in-the-loop signal: was the AI screen right? Feeds the agreement rate on the team page.
  r.post('/api/candidates/:id/feedback', ({ params, body: { helpful, note = '', recruiter_id } }) => {
    if (!recruiterOk(recruiter_id)) throw badRequest('unknown recruiter');
    if (typeof helpful !== 'boolean') throw badRequest('helpful must be true or false');
    requireCandidate(params.id);
    const n = String(note).slice(0, 1000);
    db.prepare('INSERT INTO feedback (id,candidate_id,helpful,note) VALUES (?,?,?,?)').run(randomUUID(), params.id, helpful ? 1 : 0, n);
    candidates.addActivity(params.id, recruiter_id, 'feedback', `AI screen ${helpful ? 'helpful' : 'not helpful'}${n ? `: ${n}` : ''}`);
    candidates.logEvent(params.id, 'feedback', `Recruiter marked the AI screen ${helpful ? 'helpful' : 'not helpful'}${n ? `: ${n}` : ''}`);
    return reply(201, { ok: true });
  });

  r.get('/api/recruiters', () => db.prepare('SELECT * FROM recruiters ORDER BY name').all());

  r.post('/api/candidates/:id/activities', ({ params, body: { recruiter_id, kind, text = '', rating = null } }) => {
    if (!recruiter_id || !recruiterOk(recruiter_id)) throw badRequest('recruiter_id is required');
    if (!['note', 'call', 'interview'].includes(kind)) throw badRequest('kind must be note, call or interview');
    if (kind === 'interview' && !(Number(rating) >= 1 && Number(rating) <= 5)) throw badRequest('interview needs a rating from 1 to 5');
    if (!String(text).trim() && kind !== 'interview') throw badRequest('text is required');
    requireCandidate(params.id);
    candidates.addActivity(params.id, recruiter_id, kind, String(text).slice(0, 4000), kind === 'interview' ? Number(rating) : null);
    const who = db.prepare('SELECT name FROM recruiters WHERE id=?').get(recruiter_id).name;
    candidates.logEvent(params.id, kind, `${who} logged ${kind === 'interview' ? `an interview (${rating}/5)` : `a ${kind}`}`);
    return reply(201, { ok: true });
  });

  r.get('/api/calls', () => db.prepare(`SELECT x.id, x.candidate_id, x.mode, x.status, x.run_id, x.started_at, x.ended_at, x.transcript, x.failure_reason,
      c.name, c.phone, j.title job_title, s.total, s.verdict,
      COALESCE(x.duration_sec, CAST((julianday(x.ended_at) - julianday(x.started_at)) * 86400 AS INTEGER)) duration_sec
      FROM screenings x JOIN candidates c ON c.id=x.candidate_id JOIN jobs j ON j.id=c.job_id LEFT JOIN scores s ON s.candidate_id=c.id
      ORDER BY x.started_at DESC`).all().map(x => ({ ...x, turns: json(x.transcript, []).length, transcript: undefined })));

  r.get('/api/team', () => {
    const team = db.prepare('SELECT * FROM recruiters ORDER BY name').all().map(rec => {
      const acts = db.prepare('SELECT * FROM activities WHERE recruiter_id=?').all(rec.id);
      const count = k => acts.filter(a => a.kind === k).length;
      const fb = acts.filter(a => a.kind === 'feedback');
      const ratings = acts.filter(a => a.kind === 'interview').map(a => a.rating);
      return {
        ...rec, actions: acts.length, candidates: new Set(acts.map(a => a.candidate_id)).size,
        notes: count('note'), calls: count('call'), interviews: count('interview'), stage_moves: count('stage'), reviews: fb.length,
        agree_with_ai: fb.length ? Math.round(fb.filter(a => a.text.startsWith('AI screen helpful')).length / fb.length * 100) : null,
        avg_interview_rating: ratings.length ? Math.round(ratings.reduce((x, y) => x + y, 0) / ratings.length * 10) / 10 : null,
        last_active: acts.map(a => a.created_at).sort().at(-1) || null,
      };
    });
    const acts = team.map(t => t.actions), med = [...acts].sort((a, b) => a - b)[acts.length >> 1] || 0;
    for (const t of team) t.outlier = med && t.actions >= med * 1.5 ? 'high output' : t.actions === 0 || (med && t.actions <= med * 0.5) ? 'low output' : null;
    return team;
  });

  r.get('/api/stats', () => {
    const one = sql => db.prepare(sql).get();
    const screened = one("SELECT COUNT(DISTINCT candidate_id) n FROM screenings WHERE status='completed'").n;
    const avg = one("SELECT AVG(total) a FROM scores WHERE candidate_id IN (SELECT candidate_id FROM screenings WHERE status='completed')").a;
    const fb = one('SELECT SUM(helpful) y, COUNT(*) n FROM feedback');
    return {
      total: one('SELECT COUNT(*) n FROM candidates').n, screened,
      strong: one("SELECT COUNT(*) n FROM scores s JOIN screenings x ON x.candidate_id=s.candidate_id AND x.status='completed' WHERE verdict='Strong'").n,
      avg_score: avg ? Math.round(avg) : null, helpful_yes: fb.y || 0, feedback_count: fb.n,
      by_stage: db.prepare('SELECT stage, COUNT(*) n FROM candidates GROUP BY stage').all(),
      minutes_saved: screened * 18, // assumption: 18 recruiter minutes per manual phone screen
    };
  });

  return r;
}
