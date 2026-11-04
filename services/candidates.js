// Candidate data access and scoring: reads, the score write path and its audit trail.
import { randomUUID, createHash } from 'node:crypto';
import { scoreCandidate, evaluate, evidenceOf, RUBRIC_VERSION } from '../scoring.js';
import { json, transaction } from '../lib/db.js';

// Stages the scorer may move a candidate between. Once a human moves someone to interview or hired, scoring never moves them back.
const AUTO_STAGES = ['applied', 'screening', 'screened', 'review', 'shortlisted', 'rejected'];
export const STAGES = ['applied', 'screening', 'review', 'shortlisted', 'interview', 'hired', 'rejected'];
export const stageForVerdict = v => (v === 'Strong' ? 'shortlisted' : v === 'Maybe' ? 'review' : 'rejected');

/** @param {import('node:sqlite').DatabaseSync} db */
export function createCandidateService(db) {
  const q = {
    job: db.prepare('SELECT * FROM jobs WHERE id=?'),
    cand: db.prepare('SELECT * FROM candidates WHERE id=?'),
    latestDone: db.prepare("SELECT * FROM screenings WHERE candidate_id=? AND status='completed' ORDER BY ended_at DESC LIMIT 1"),
    event: db.prepare('INSERT INTO events (candidate_id,kind,detail) VALUES (?,?,?)'),
    activity: db.prepare('INSERT INTO activities (id,candidate_id,recruiter_id,kind,text,rating) VALUES (?,?,?,?,?,?)'),
    upsertScore: db.prepare(`INSERT INTO scores (candidate_id,total,verdict,breakdown,flags,updated_at) VALUES (?,?,?,?,?,datetime('now'))
      ON CONFLICT(candidate_id) DO UPDATE SET total=excluded.total, verdict=excluded.verdict, breakdown=excluded.breakdown, flags=excluded.flags, updated_at=excluded.updated_at`),
    audit: db.prepare('INSERT INTO score_audit (candidate_id,rubric_version,total,verdict,inputs_hash,breakdown,trigger) VALUES (?,?,?,?,?,?,?)'),
    autoStage: db.prepare(`UPDATE candidates SET stage=? WHERE id=? AND stage IN (${AUTO_STAGES.map(() => '?').join(',')})`),
    pool: db.prepare('SELECT c.id, c.years, c.expected_salary, s.total FROM candidates c LEFT JOIN scores s ON s.candidate_id=c.id WHERE c.job_id=? AND c.id<>?'),
  };

  const jobRow = id => { const j = q.job.get(id); return j ? { ...j, locations: json(j.locations, []), must_skills: json(j.must_skills, []) } : null; };
  const get = id => q.cand.get(id);
  const exists = id => Boolean(id && q.cand.get(id));
  const logEvent = (cid, kind, detail) => q.event.run(cid, kind, detail);
  const addActivity = (cid, rid, kind, text, rating = null) => q.activity.run(randomUUID(), cid, rid || null, kind, text, rating);
  const latestAnswers = cid => { const s = q.latestDone.get(cid); return s ? json(s.answers, {}) : null; };

  function evaluationFor(c) {
    const answers = latestAnswers(c.id);
    const result = scoreCandidate(c, jobRow(c.job_id), answers);
    const pool = q.pool.all(c.job_id, c.id).map(p => { const a = latestAnswers(p.id) || {}; return { years: a.years_experience ?? p.years, expected_salary: a.expected_salary ?? p.expected_salary, total: p.total }; });
    return evaluate(result, c, answers, pool);
  }

  function full(id) {
    const c = get(id);
    if (!c) return null;
    const s = db.prepare('SELECT * FROM scores WHERE candidate_id=?').get(id);
    const screenings = db.prepare('SELECT * FROM screenings WHERE candidate_id=? ORDER BY started_at DESC').all(id)
      .map(x => ({ ...x, transcript: json(x.transcript, []), answers: json(x.answers, {}), raw: undefined }));
    const done = screenings.find(x => x.status === 'completed');
    return {
      ...c,
      highlights: done?.answers?.evidence_text ? evidenceOf(done.answers.evidence_text) : null,
      evaluation: evaluationFor(c),
      activities: db.prepare('SELECT a.*, r.name recruiter_name FROM activities a LEFT JOIN recruiters r ON r.id=a.recruiter_id WHERE candidate_id=? ORDER BY a.created_at DESC').all(id),
      job: jobRow(c.job_id),
      score: s ? { ...s, breakdown: json(s.breakdown, []), flags: json(s.flags, []) } : null,
      screenings,
      feedback: db.prepare('SELECT * FROM feedback WHERE candidate_id=? ORDER BY created_at DESC').all(id),
      events: db.prepare('SELECT * FROM events WHERE candidate_id=? ORDER BY id').all(id),
      score_history: db.prepare('SELECT rubric_version, total, verdict, trigger, created_at FROM score_audit WHERE candidate_id=? ORDER BY id DESC LIMIT 20').all(id),
    };
  }

  /**
   * Recompute and store the score, move the candidate to the matching stage if a screen is done,
   * and append an audit row (rubric version + hash of the exact inputs) in one transaction.
   */
  function rescore(cid, trigger = 'update') {
    return transaction(db, () => {
      const c = get(cid);
      const job = jobRow(c.job_id);
      const scr = q.latestDone.get(cid);
      const answers = scr ? json(scr.answers, {}) : null;
      const result = scoreCandidate(c, job, answers);
      q.upsertScore.run(cid, result.total, result.verdict, JSON.stringify(result.breakdown), JSON.stringify(result.flags));
      const inputs = createHash('sha256').update(JSON.stringify([c.years, c.expected_salary, c.notice_days, c.city, c.skills, c.why, job, answers])).digest('hex').slice(0, 16);
      q.audit.run(cid, RUBRIC_VERSION, result.total, result.verdict, inputs, JSON.stringify(result.breakdown), trigger);
      if (scr) q.autoStage.run(stageForVerdict(result.verdict), cid, ...AUTO_STAGES);
      return result;
    });
  }

  return { jobRow, get, exists, full, evaluationFor, rescore, logEvent, addActivity, latestAnswers };
}
