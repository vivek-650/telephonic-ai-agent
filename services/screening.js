// The interview contract with the voice agent, as pure functions:
//  - screeningContext(): every variable the agent prompt can use (dograh/screener-prompt.txt, also inside dograh/workflow.json)
//  - parseWebhook(): normalise Dograh's result payload
//  - answersFromDograh() / transcriptFromDograh() / transcriptFromRun(): map it onto our answer keys
import { QUESTIONS, parseAnswer, resumeProbes } from '../scoring.js';
import { json } from '../lib/db.js';

const lpa = m => (m * 12 / 100000).toFixed(1).replace(/\.0$/, '');

/**
 * Salary negotiation settings. Budget and stretch are monthly rupees; the agent speaks in lakhs per year.
 * Off unless SCREEN_NEGOTIATION=1: the screening call only records the expectation, and with the flag off no
 * budget figure reaches the prompt (or the apply response that carries this context to the browser).
 */
export function negotiationContext(job) {
  if (process.env.SCREEN_NEGOTIATION !== '1') {
    return { negotiation_enabled: 'no', job_budget_monthly: '', job_stretch_monthly: '', job_budget_lpa: '', job_stretch_lpa: '', negotiation_notes: '' };
  }
  const budget = Number(job.max_salary) || 0;
  const pct = Number.isFinite(Number(job.stretch_pct)) ? Number(job.stretch_pct) : 10;
  const stretch = Math.round(budget * (1 + pct / 100));
  return {
    negotiation_enabled: job.negotiable && budget ? 'yes' : 'no',
    job_budget_monthly: String(budget || ''), job_stretch_monthly: String(budget ? stretch : ''),
    job_budget_lpa: budget ? lpa(budget) : '', job_stretch_lpa: budget ? lpa(stretch) : '',
    negotiation_notes: String(job.negotiation_notes || ''),
  };
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The pre-call resume brief the interviewer works from instead of the raw resume: up to 5 facts, 3 probe
 * questions and 1 claim to cross-check. Capped at 400 characters (~100 tokens) so the interview node plus
 * the global prompt stays within the 700-token single-node budget.
 */
export function resumeBrief(c) {
  const p = resumeProbes(c.resume_text);
  p.highlights = (p.highlights || []).map(h => h.replace(/^[-*•\s]+/, ''));
  const parsed = json(c.resume_summary, null);
  const span = p.summary.match(/~(\d+) yrs span/)?.[1];
  const facts = [
    parsed?.current_company ? `at ${parsed.current_company}` : '',
    span ? `work history spans ~${span} yrs` : '',
    p.skills.length ? `skills: ${p.skills.slice(0, 5).join(', ')}` : '',
    p.gaps.length ? `gap ${p.gaps[0].after}-${p.gaps[0].until}` : '',
    ...p.highlights.slice(0, 2).map(h => clip(h, 90)),
  ].filter(Boolean).slice(0, 5);
  const probes = [
    ...p.gaps.map(g => `What were you doing ${g.after}-${g.until}?`),
    ...p.highlights.map(h => `"${clip(h, 60)}": what did you do yourself?`),
    ...p.skills.map(s => `Hardest problem you solved with ${s}?`),
  ].slice(0, 3);
  const formYears = Number(c.years);
  const claim = span && formYears && Math.abs(Number(span) - formYears) >= 2 ? `form says ${formYears} yrs, resume spans ~${span} yrs`
    : p.highlights[0] ? clip(p.highlights[0], 100) : p.skills[0] ? `claims ${p.skills[0]}` : '';
  let brief = { resume_summary: facts.join('; '), resume_probes: probes.join(' | '), resume_claim: claim };
  while (brief.resume_summary.length + brief.resume_probes.length + brief.resume_claim.length > 400) {
    brief = { ...brief, resume_summary: brief.resume_summary.split('; ').slice(0, -1).join('; ') };
    if (!brief.resume_summary) { brief.resume_probes = clip(brief.resume_probes, 400 - brief.resume_claim.length); break; }
  }
  return brief;
}

/**
 * Everything the AI interviewer knows about this candidate and role. Every `{{variable}}` in
 * dograh/workflow.json must be a key here (enforced by tests/unit/interview-contract.test.mjs).
 */
export function screeningContext(c, job) {
  const { resume_summary, resume_probes, resume_claim } = resumeBrief(c);
  return {
    candidate_id: c.id, candidate_name: c.name, candidate_first_name: String(c.name || '').trim().split(/\s+/)[0], candidate_city: c.city,
    form_years_experience: String(c.years ?? ''), form_notice_days: String(c.notice_days ?? ''),
    form_expected_salary: String(c.expected_salary ?? ''), form_skills: c.skills || '',
    form_expected_lpa: Number(c.expected_salary) > 0 ? lpa(Number(c.expected_salary)) : '',
    job_title: job.title, company_name: job.company, job_location: job.location,
    job_min_years: String(job.min_years), job_must_skills: job.must_skills.join(', '),
    job_custom_questions: json(job.custom_questions, []).join?.(' | ') || '',
    has_resume: c.resume_text ? 'yes' : 'no',
    resume_summary,
    resume_text: String(c.resume_text || '').slice(0, 6000),
    applied_date: new Date(String(c.created_at || '').replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }),
    resume_probes, resume_claim,
    ...negotiationContext(job),
    agent_name: job.agent_name || process.env.AGENT_NAME || 'Priya',
    // phone for outbound calls; the careers page overrides this with web for browser interviews.
    interview_mode: 'phone',
  };
}

// Raw control characters (newlines from resume text) make JSON.parse fail; escape them and retry.
const escapeControl = s => s.replace(/[\u0000-\u001f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const parseLoose = s => { try { return JSON.parse(s); } catch { try { return JSON.parse(escapeControl(s)); } catch { return {}; } } };

/**
 * Normalise a webhook body in place. Dograh's Jinja renderer JSON-stringifies dict variables,
 * so the context fields may arrive as objects or as strings.
 */
export function parseWebhook(b, headers = {}) {
  for (const k of ['initial_context', 'gathered_context', 'extracted_variables']) if (typeof b[k] === 'string') b[k] = parseLoose(b[k]);
  const runId = String(b.workflow_run_id ?? b.run_id ?? b.id ?? headers['x-dograh-workflow-run-id'] ?? '');
  return { body: b, ic: b.initial_context || {}, runId };
}

/** Map a Dograh webhook payload onto our answer keys, parsing spoken answers ("one month", "6 LPA"). */
export function answersFromDograh(body) {
  const g = body.gathered_context || body.extracted_variables || {};
  const pick = (...k) => { for (const x of k) if (g[x] !== undefined && g[x] !== null && g[x] !== '') return g[x]; return undefined; };
  const a = {
    years_experience: pick('years_experience', 'experience_years', 'years'),
    notice_days: pick('notice_period_days', 'notice_days', 'notice_period'),
    expected_salary: pick('expected_salary', 'expected_salary_monthly', 'salary_expectation'),
    relocation_ok: pick('relocation_ok', 'location_ok', 'can_work_from_location'),
    skill_example: pick('skill_example', 'role_example', 'experience_example'),
    availability: pick('interview_availability', 'availability'),
    negotiation_outcome: pick('negotiation_outcome'),
    agreed_salary: pick('agreed_salary'),
  };
  // Evidence from screening v2 (dograh/prompts). Optional: older agents never send them, and scoring ignores them.
  const flag = x => (x === true || x === 'true' ? true : x === false || x === 'false' ? false : undefined);
  const signal = x => (/^(strong|partial|weak|unclear)$/i.test(String(x ?? '')) ? String(x).toLowerCase() : undefined);
  Object.assign(a, {
    mismatch_detected: flag(pick('mismatch_detected')), mismatch_note: pick('mismatch_note'),
    ownership_signal: signal(pick('ownership_signal')), depth_signal: signal(pick('depth_signal')),
    left_early: flag(pick('left_early')), ai_disclosed: flag(pick('ai_disclosed')),
  });
  for (const q of QUESTIONS) if (typeof a[q.key] === 'string') a[q.key] = parseAnswer(q, a[q.key]);
  if (typeof a.agreed_salary === 'string') a.agreed_salary = parseAnswer({ type: 'salary' }, a.agreed_salary);
  if (typeof a.negotiation_outcome === 'string') a.negotiation_outcome = normaliseNegotiation(a.negotiation_outcome);
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
}

/** Free-text negotiation outcome -> accepted | declined | not_needed | not_discussed. */
export function normaliseNegotiation(text) {
  const o = String(text).toLowerCase().trim();
  if (/^(accepted|declined|not_needed|not_discussed)$/.test(o)) return o;
  if (/(agree|fine|work|okay|ok|yes|accept|sounds)/.test(o) && !/(not|n't|no)\b/.test(o)) return 'accepted';
  return /(no|not|too|less|low)/.test(o) ? 'declined' : 'not_discussed';
}

export function transcriptFromDograh(body) {
  const t = body.transcript || body.messages || [];
  if (!Array.isArray(t)) return [];
  return t.map(m => ({
    role: /assistant|agent|bot/i.test(m.role || m.speaker || '') ? 'agent' : 'candidate',
    text: m.content || m.text || m.message || '',
  })).filter(m => m.text);
}

/** Rebuild the transcript from a Dograh run's realtime events, merging consecutive pieces by speaker. */
export function transcriptFromRun(run) {
  const evs = (run?.logs?.realtime_feedback_events || [])
    .filter(e => e.type === 'rtf-bot-text' || e.type === 'rtf-user-transcription')
    .sort((x, y) => String(x.timestamp).localeCompare(String(y.timestamp)));
  const turns = [];
  for (const e of evs) {
    const role = e.type === 'rtf-bot-text' ? 'assistant' : 'user';
    const text = String(e.payload?.text || '').trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += ' ' + text; else turns.push({ role, content: text });
  }
  return turns;
}

/** A call counts as an interview only if the candidate spoke and it lasted 15 seconds or more. */
export const isIncomplete = (transcript, durationSec) =>
  transcript.filter(t => t.role === 'candidate').length === 0 || (durationSec !== null && durationSec < 15);
