// Builds dograh/workflow.json (the screening agent) from the prompts in dograh/prompts/.
// The prompt files are the source of truth; edit them, then run: node scripts/build-screener.mjs
//
// Default graph (what ships): one screening node that speaks first (no fixed greeting, so web mode can skip the
// identity check) and runs the staged call flow in global.txt + interview.txt, then one endCall node that says
// "Take care, bye!" after the agent's own goodbye and hangs up. A one-question-per-node graph (prompts in dograh/prompts/multi/)
// builds with --multi; in testing the hosted model skipped or doubled transitions there, see CHANGES.md.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MULTI = process.argv.includes('--multi');
// --compact: the same flow in about 1,000 tokens (dograh/prompts/compact/) for our own Groq key, whose free tier
// allows 8,000 tokens per minute per model. Writes dograh/workflow-compact.json; the close prompt is shared.
const COMPACT = process.argv.includes('--compact');
const P = name => readFileSync(path.join(ROOT, 'dograh', 'prompts', `${COMPACT && name !== 'close' ? 'compact/' : ''}${name}.txt`), 'utf8').trim();
const v = (name, type, prompt) => ({ name, type, prompt });

const EXTRACT = 'Extract only what the candidate actually said. Use an empty value or false when it was not discussed; never guess. If the interview never started (wrong person, no time), leave every evidence field empty or false.';
const signal = 'strong, partial, weak or unclear';

// The webhook contract (services/screening.js answersFromDograh) reads these names; the evidence fields are new.
const VARS = {
  open: [
    v('good_time_confirmed', 'boolean', 'True if they agreed now is a good time.'),
    v('applied_confirmed', 'boolean', 'Default true: the application form proves it. False only if they explicitly said they never applied.'),
    v('interview_availability', 'string', 'The time window they gave for a callback, in their words. Empty if none.'),
  ],
  form: [
    v('years_experience', 'number', 'Years of relevant experience as a number, e.g. 2 or 1.5. Hindi number words count.'),
    v('notice_period_days', 'number', 'Notice period as whole days: immediate = 0, one month = 30, two months = 60.'),
    v('expected_salary', 'string', 'Expected salary as a number plus unit, e.g. "6 LPA" or "50000 monthly". Empty if they gave no figure.'),
    v('relocation_ok', 'boolean', 'True if they live in or can work from the job location.'),
    v('negotiation_outcome', 'string', 'accepted, declined or not_discussed. Use not_discussed unless salary was negotiated.'),
    v('agreed_salary', 'string', 'A salary figure they explicitly agreed to, with unit. Usually empty.'),
  ],
  own: [
    v('skill_example', 'string', 'What they personally built, in their words, one or two sentences.'),
    v('ownership_signal', 'string', `Did they describe their own part concretely? Big claims without specifics are weak. One of: ${signal}.`),
  ],
  verify1: [
    v('mismatch_detected', 'boolean', 'True if their title, years or role conflicted with the form or resume.'),
    v('mismatch_note', 'string', 'One line on the conflict and how they explained it. Empty if none.'),
  ],
  verify2: [v('depth_signal', 'string', `How specific were their how/why/what-broke answers and numbers? One of: ${signal}.`)],
  skill2: [v('custom_answers', 'string', 'Their answers to the scenario and any role question, in their words, briefly.')],
  close: [
    v('left_early', 'boolean', 'True if they ended the interview before the last question was answered.'),
    v('ai_disclosed', 'boolean', 'True if they asked whether this is an AI and were told yes.'),
  ],
};
const ALL_VARS = Object.values(VARS).flat();

const node = (id, type, y, data) => ({ id, type, position: { x: 0, y }, data });
const extraction = vars => (vars.length ? { extraction_enabled: true, extraction_prompt: EXTRACT, extraction_variables: vars } : { extraction_enabled: false });
const edge = (source, target, label, condition) => ({ id: `${source}-${target}-${label.toLowerCase().replace(/\W+/g, '-')}`, source, target, data: { label, condition } });
const greeting = MULTI ? { greeting_type: 'text', greeting: P('multi/greeting'), allow_greeting_interrupt: true } : {};

const common = [
  { id: 'trig', type: 'trigger', position: { x: -360, y: 320 }, data: { name: 'Phone trigger' } },
  {
    id: 'hook', type: 'webhook', position: { x: 360, y: 480 },
    data: {
      name: 'Recruiting webhook', enabled: true, http_method: 'POST', endpoint_url: '__WEBHOOK_URL__',
      payload_template: {
        workflow_run_id: '{{ workflow_run_id }}', call_time: '{{ call_time }}', initial_context: '{{ initial_context }}',
        gathered_context: '{{ gathered_context }}', workflow_id: '{{ workflow_id }}',
      },
    },
  },
];

let nodes, edges;
if (!MULTI) {
  // Extraction runs once, as the call moves to the goodbye (or at hang-up if the candidate drops).
  nodes = [
    { id: 'global', type: 'globalNode', position: { x: -360, y: 0 }, data: { name: 'Persona and rules', prompt: P('global') } },
    node('start', 'startCall', 0, { name: 'Screening', prompt: P('interview'), allow_interrupt: true, add_global_prompt: true, ...extraction(ALL_VARS) }),
    node('end', 'endCall', 180, { name: 'End call', prompt: P('close'), allow_interrupt: false, add_global_prompt: false }),
    ...common,
  ];
  edges = [edge('start', 'end', 'End call', 'Call this immediately after you say your final goodbye: at the end of Stage 7, or when any instruction says to end the call (wrong person, did not apply, not interested, not a good time, does not want to be recorded, wants a human, abusive, bad line), or when the person clearly asks to stop. Never call it before the goodbye and never keep talking after it.')];
} else {
  const M = name => P(`multi/${name}`);
  const step = (id, name, prompt, y, vars) => node(id, 'agentNode', y, { name, prompt: M(prompt), allow_interrupt: true, add_global_prompt: true, ...extraction(vars) });
  nodes = [
    { id: 'global', type: 'globalNode', position: { x: -360, y: 0 }, data: { name: 'Persona and rules', prompt: M('global') } },
    node('start', 'startCall', 0, { name: 'Open', ...greeting, prompt: M('open'), allow_interrupt: true, add_global_prompt: true, ...extraction(VARS.open) }),
    step('form', 'Form check', 'form_check', 120, VARS.form),
    step('own', 'Ownership', 'own', 240, VARS.own),
    step('verify1', 'Verify 1', 'verify1', 360, VARS.verify1),
    step('verify2', 'Verify 2', 'verify2', 480, VARS.verify2),
    step('skill', 'Skill check', 'skill', 600, []),
    step('skill2', 'Skill follow-up', 'skill2', 720, VARS.skill2),
    node('close', 'endCall', 840, { name: 'Close', prompt: M('close'), allow_interrupt: false, add_global_prompt: true, ...extraction(VARS.close) }),
    node('exit', 'endCall', 960, { name: 'Polite exit', prompt: M('exit'), allow_interrupt: false, add_global_prompt: true }),
    ...common,
  ];
  const LEAVE = 'They declined your one "two quick questions" ask and still want to leave.';
  edges = [
    edge('start', 'form', 'Good time', 'They said now is okay.'),
    edge('start', 'exit', 'Exit', 'Wrong person, refuses recording, says they never applied, or is busy and you already have a time window.'),
    edge('form', 'own', 'Form done', 'They replied to your form check.'),
    edge('own', 'verify1', 'Own done', 'They replied to your ownership question.'),
    edge('verify1', 'verify2', 'Verify1 done', 'They replied to your question.'),
    edge('verify2', 'skill', 'Verify2 done', 'They replied to your question.'),
    edge('skill', 'skill2', 'Skill done', 'They replied to the scenario.'),
    edge('skill2', 'close', 'Skill2 done', 'They replied to your last question.'),
    ...['form', 'own', 'verify1', 'verify2', 'skill', 'skill2'].map(s => edge(s, 'close', 'Leave early', LEAVE)),
  ];
}

writeFileSync(path.join(ROOT, 'dograh', COMPACT ? 'workflow-compact.json' : 'workflow.json'), JSON.stringify({ nodes, edges }, null, 2) + '\n');
// The full system prompt the interview runs with (Dograh joins global + node with a blank line). Read by the
// engine room page and the contract test; generated, do not edit by hand.
if (!MULTI && !COMPACT) writeFileSync(path.join(ROOT, 'dograh', 'screener-prompt.txt'), `${P('global')}\n\n${P('interview')}\n`);
console.log(`dograh/${COMPACT ? 'workflow-compact' : 'workflow'}.json (${MULTI ? 'multi-node' : COMPACT ? 'compact single-node' : 'single-node'}): ${nodes.length} nodes, ${edges.length} edges`);
