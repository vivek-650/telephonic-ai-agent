// The interview contract with the voice agent, as pure functions:
//  - screeningContext(): every variable the agent prompt can use (dograh/screener-prompt.txt)
//  - parseWebhook(): normalise Dograh's result payload
//  - answersFromDograh() / transcriptFromDograh() / transcriptFromRun(): map it onto our answer keys
import { QUESTIONS, parseAnswer, resumeProbes } from '../scoring.js';
import { json } from '../lib/db.js';

/** Salary negotiation settings. Budget and stretch are monthly rupees; the agent speaks in lakhs per year. */
export function negotiationContext(job) {
  const budget = Number(job.max_salary) || 0;
  const pct = Number.isFinite(Number(job.stretch_pct)) ? Number(job.stretch_pct) : 10;
  const stretch = Math.round(budget * (1 + pct / 100));
  const lpa = m => (m * 12 / 100000).toFixed(1).replace(/\.0$/, '');
  return {
    negotiation_enabled: job.negotiable && budget ? 'yes' : 'no',
    job_budget_monthly: String(budget || ''), job_stretch_monthly: String(budget ? stretch : ''),
    job_budget_lpa: budget ? lpa(budget) : '', job_stretch_lpa: budget ? lpa(stretch) : '',
    negotiation_notes: String(job.negotiation_notes || ''),
  };
}

/**
 * Everything the AI interviewer knows about this candidate and role. Every `{{variable}}` in
 * dograh/screener-prompt.txt must be a key here (enforced by tests/unit/prompt-contract.test.mjs).
 */
export function screeningContext(c, job) {
  const probes = resumeProbes(c.resume_text);
  const parsed = json(c.resume_summary, null);
  const resume_summary = [
    parsed?.summary || '', parsed?.skills?.length ? `Parsed skills: ${parsed.skills.join(', ')}` : '',
    parsed?.current_company ? `Current company: ${parsed.current_company}` : '',
    probes.summary,
  ].filter(Boolean).join('. ').slice(0, 900);
  return {
    candidate_id: c.id, candidate_name: c.name, candidate_first_name: String(c.name || '').trim().split(/\s+/)[0], candidate_city: c.city,
    form_years_experience: String(c.years ?? ''), form_notice_days: String(c.notice_days ?? ''),
    form_expected_salary: String(c.expected_salary ?? ''), form_skills: c.skills || '',
    job_title: job.title, company_name: job.company, job_location: job.location,
    job_min_years: String(job.min_years), job_must_skills: job.must_skills.join(', '),
    job_custom_questions: json(job.custom_questions, []).join?.(' | ') || '',
    has_resume: c.resume_text ? 'yes' : 'no',
    resume_summary,
    resume_text: String(c.resume_text || '').slice(0, 6000),
    applied_date: new Date(String(c.created_at || '').replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }),
    resume_probes: probes.probes.join(' | '),
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
