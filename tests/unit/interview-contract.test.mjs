// The contract between this server and the voice agent, and the AI scoring guarantees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { screeningContext, resumeBrief, parseWebhook, answersFromDograh, transcriptFromRun, normaliseNegotiation, isIncomplete } from '../../services/screening.js';
import { scoreCandidate, mentionsSkill, RUBRIC_VERSION } from '../../scoring.js';

const file = f => readFileSync(fileURLToPath(new URL(`../../dograh/${f}`, import.meta.url)), 'utf8');
const JOB = { title: 'Inside Sales Executive', company: 'Acme', location: 'Pune', min_years: 2, max_salary: 60000, max_notice_days: 30, locations: ['pune'], must_skills: ['crm', 'cold calling'], negotiable: 1, stretch_pct: 10 };
const CAND = { id: 'c1', name: 'Riya Sharma', city: 'Pune', years: 3, notice_days: 15, expected_salary: 52000, skills: 'CRM', created_at: '2026-11-01 10:00:00' };

const PROMPTS = ['global', 'interview', 'close'].map(n => file(`prompts/${n}.txt`));
// Renders {{var | fallback:text}} the way Dograh does; tokens are estimated as characters / 4.
const render = (tpl, ctx) => tpl.replace(/\{\{\s*(\w+)\s*(?:\|\s*fallback:([^}]*))?\}\}/g, (_, k, fb) => (ctx[k] ? String(ctx[k]) : (fb ?? '').trim()));
const tokens = s => Math.ceil(s.length / 4);
const RESUME = 'Backend Engineer, Acme Payments, Jan 2022 - Present\nIntern, Zeta, Jun 2021 - Dec 2021\n- Built the payout retry queue in Go, cutting failed payouts from 2.1% to 0.3%\n- Moved 12 services to Docker with CI on GitHub Actions\nSkills: Go, Postgres, Kafka, Docker, AWS';

test('every {{variable}} in the agent prompts is supplied by screeningContext()', () => {
  const ctx = screeningContext(CAND, JOB);
  const vars = new Set(PROMPTS.flatMap(p => [...p.matchAll(/\{\{\s*(?:initial_context\.)?(\w+)/g)].map(m => m[1])));
  const missing = [...vars].filter(v => !(v in ctx));
  assert.deepEqual(missing, [], `prompts use variables the server never sends: ${missing.join(', ')}`);
});

test('workflow.json and screener-prompt.txt are built from dograh/prompts (run scripts/build-screener.mjs)', () => {
  const wf = JSON.parse(file('workflow.json'));
  const byType = t => wf.nodes.find(n => n.type === t)?.data;
  const [global, interview, close] = PROMPTS.map(p => p.trim());
  assert.equal(byType('globalNode').prompt, global);
  assert.equal(byType('startCall').prompt, interview);
  assert.ok(!byType('startCall').greeting, 'the agent speaks first, so web mode can skip the identity check');
  assert.equal(byType('endCall').prompt, close, 'the agent must be able to hang up after its goodbye');
  assert.match(global, /call(ing)? the end_call function/, 'the prompt names the hang-up tool');
  assert.equal(wf.edges[0].data.label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), 'end_call', 'Dograh names the tool after the edge label');
  assert.equal(file('screener-prompt.txt').trim(), `${global}\n\n${interview}`);
  const vars = byType('startCall').extraction_variables.map(v => v.name);
  for (const k of ['years_experience', 'notice_period_days', 'expected_salary', 'relocation_ok', 'skill_example', 'interview_availability', 'custom_answers', 'applied_confirmed', 'good_time_confirmed', 'negotiation_outcome', 'agreed_salary']) assert.ok(vars.includes(k), `extraction contract: ${k}`);
  assert.ok(byType('startCall').extraction_variables.every(v => v.prompt), 'Dograh reads extraction hints from `prompt`');
});

test('prompt budgets: global + interview <= 7,000 tokens rendered with a resume, resume brief <= 400 chars', () => {
  const ctx = screeningContext({ ...CAND, resume_text: RESUME }, JOB);
  const [global, interview] = PROMPTS;
  // The staged call flow is long on purpose (it is what sounds natural); this cap only stops it growing further.
  const run = tokens(render(global, ctx)) + tokens(render(interview, ctx));
  assert.ok(run <= 7000, `global + interview rendered ${run}`);
  const brief = resumeBrief({ ...CAND, resume_text: RESUME.repeat(4) });
  assert.ok(Object.values(brief).join('').length <= 400, 'brief cap');
  assert.ok(brief.resume_probes.split(' | ').length <= 3);
});

test('negotiation is off unless SCREEN_NEGOTIATION=1, and then speaks lakhs per year', () => {
  const off = screeningContext(CAND, JOB);
  assert.equal(off.negotiation_enabled, 'no');
  assert.equal(off.job_budget_lpa + off.job_budget_monthly + off.job_stretch_lpa + off.job_stretch_monthly, '', 'no budget reaches the prompt or the browser');
  process.env.SCREEN_NEGOTIATION = '1';
  try {
    const c = screeningContext(CAND, JOB);
    assert.equal(c.negotiation_enabled, 'yes'); assert.equal(c.job_budget_lpa, '7.2'); assert.equal(c.job_stretch_monthly, '66000');
    assert.equal(screeningContext(CAND, { ...JOB, negotiable: 0 }).negotiation_enabled, 'no');
  } finally { delete process.env.SCREEN_NEGOTIATION; }
});

test('screening v2 evidence fields pass through, normalised, and are optional', () => {
  const a = answersFromDograh({ gathered_context: { mismatch_detected: 'true', mismatch_note: 'form 7 yrs, resume ~5', ownership_signal: 'Weak', depth_signal: 'bogus', left_early: false } });
  assert.deepEqual(a, { mismatch_detected: true, mismatch_note: 'form 7 yrs, resume ~5', ownership_signal: 'weak', left_early: false });
  assert.deepEqual(answersFromDograh({ gathered_context: {} }), {});
});

test('webhook parsing survives stringified context with raw newlines', () => {
  const { ic, runId } = parseWebhook({ id: 7, initial_context: '{"candidate_id":"c1","resume_text":"a\nb"}' });
  assert.equal(ic.candidate_id, 'c1'); assert.equal(runId, '7');
  assert.deepEqual(parseWebhook({ initial_context: '{nonsense' }).ic, {});
});

test('spoken answers are parsed into structured values', () => {
  const a = answersFromDograh({ gathered_context: { years_experience: 'about three years', notice_period: 'one month', expected_salary: '6 LPA', relocation_ok: 'yes', negotiation_outcome: 'okay that works for me', agreed_salary: '55k' } });
  assert.deepEqual(a, { years_experience: 3, notice_days: 30, expected_salary: 50000, relocation_ok: true, negotiation_outcome: 'accepted', agreed_salary: 55000 });
  assert.equal(normaliseNegotiation("no that's too low"), 'declined');
  assert.equal(normaliseNegotiation('we did not talk about it'), 'declined');
  assert.equal(normaliseNegotiation('not_needed'), 'not_needed');
});

test('run transcript merges consecutive speech by speaker and orders by time', () => {
  const t = transcriptFromRun({ logs: { realtime_feedback_events: [
    { type: 'rtf-user-transcription', timestamp: '2', payload: { text: 'yes' } },
    { type: 'rtf-bot-text', timestamp: '0', payload: { text: 'Hi' } }, { type: 'rtf-bot-text', timestamp: '1', payload: { text: 'Riya' } },
  ] } });
  assert.deepEqual(t, [{ role: 'assistant', content: 'Hi Riya' }, { role: 'user', content: 'yes' }]);
  assert.equal(isIncomplete([{ role: 'agent', text: 'hello?' }], null), true, 'candidate never spoke');
  assert.equal(isIncomplete([{ role: 'candidate', text: 'hi' }], 9), true, 'under 15 seconds');
});

test('skill matching is whole-word: java is not javascript', () => {
  assert.equal(mentionsSkill('Senior JavaScript developer', 'java'), false);
  assert.equal(mentionsSkill('Java, Spring', 'java'), true);
  assert.equal(mentionsSkill('owned SLAs for 3 teams', 'sla'), true);
  assert.equal(mentionsSkill('C++ and Node.js', 'node.js'), true);
});

test('fairness: personal attributes never change the score', () => {
  // Same job-relevant facts, different name and phrasing of personal details: identical score.
  const answers = { years_experience: 3, expected_salary: 50000, notice_days: 15, relocation_ok: true, skill_example: 'I made 80 cold calls a day in HubSpot CRM and booked 22 demos last quarter.' };
  const base = scoreCandidate({ ...CAND, name: 'Riya Sharma' }, JOB, answers);
  for (const name of ['Mohammed Iqbal', 'John Fernandes', 'Gurpreet Kaur', 'Arjun Reddy']) {
    const r = scoreCandidate({ ...CAND, name, why: '' }, JOB, answers);
    assert.equal(r.total, base.total, `score changed for ${name}`); assert.equal(r.verdict, base.verdict);
  }
  const withPersonal = scoreCandidate(CAND, JOB, { ...answers, evidence_text: 'I am 34, married, and a mother of two.' });
  assert.equal(withPersonal.total, base.total, 'age, marital status and family plans are ignored');
});

test('the rubric is versioned and always sums to 100', () => {
  assert.match(RUBRIC_VERSION, /^\d{4}\.\d{2}-\d+$/);
  const r = scoreCandidate(CAND, JOB, { years_experience: 3 });
  assert.equal(r.breakdown.reduce((s, b) => s + b.max, 0), 100);
});

test('spoken Hindi and Hinglish numbers are normalised to English values', () => {
  const a = answersFromDograh({ gathered_context: { years_experience: 'teen saal', notice_period_days: 'ek mahina', expected_salary: 'chaudah lakh saal ka', relocation_ok: 'haan, kar sakti hoon' } });
  assert.deepEqual(a, { years_experience: 3, notice_days: 30, expected_salary: 116667, relocation_ok: true });
  const b = answersFromDograh({ gathered_context: { years_experience: 'डेढ़ साल', notice_period_days: 'turant', expected_salary: 'pachas hazaar mahina' } });
  assert.deepEqual(b, { years_experience: 1.5, notice_days: 0, expected_salary: 50000 });
  assert.equal(answersFromDograh({ gathered_context: { notice_period_days: 'do hafte' } }).notice_days, 14);
  assert.equal(answersFromDograh({ gathered_context: { expected_salary: 'सात लाख' } }).expected_salary, 58333);
  assert.equal(answersFromDograh({ gathered_context: { expected_salary: '50 hazar per month' } }).expected_salary, 50000, 'hazar is thousand, not 50 rupees');
  assert.equal(answersFromDograh({ gathered_context: { years_experience: 'I do have 3 years' } }).years_experience, 3, 'English "do" is not the Hindi 2');
});

test('compact prompt (Groq free tier): same contract, built from dograh/prompts/compact, <= 1,500 tokens rendered', () => {
  const ctx = screeningContext({ ...CAND, resume_text: RESUME }, JOB);
  const [global, interview] = ['global', 'interview'].map(n => file(`prompts/compact/${n}.txt`).trim());
  const vars = [...`${global}\n${interview}`.matchAll(/\{\{\s*(\w+)/g)].map(m => m[1]);
  assert.deepEqual(vars.filter(v => !(v in ctx)), [], 'compact prompt uses variables the server never sends');
  const wf = JSON.parse(file('workflow-compact.json'));
  const byType = t => wf.nodes.find(n => n.type === t)?.data;
  assert.equal(byType('globalNode').prompt, global);
  assert.equal(byType('startCall').prompt, interview);
  assert.equal(byType('endCall').prompt, PROMPTS[2].trim());
  assert.deepEqual(byType('startCall').extraction_variables.map(v => v.name), JSON.parse(file('workflow.json')).nodes.find(n => n.type === 'startCall').data.extraction_variables.map(v => v.name), 'same extraction contract');
  const run = tokens(render(global, ctx)) + tokens(render(interview, ctx));
  assert.ok(run <= 1500, `compact rendered ${run}: a reply must fit well inside 8,000 tokens a minute`);
});
