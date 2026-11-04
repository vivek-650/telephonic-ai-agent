// Offline evaluation of the interview pipeline: spoken answers -> parsed values -> score -> verdict.
// Reports extraction accuracy per field, verdict accuracy with a confusion matrix, expected flags,
// and fairness (score invariance when only the candidate's name changes). Exits 1 below the gates.
//
//   npm run eval              table in the terminal
//   npm run eval -- --json    machine-readable result (for CI artifacts)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { answersFromDograh } from '../services/screening.js';
import { scoreCandidate, RUBRIC_VERSION } from '../scoring.js';

const GATES = { extraction: 0.95, verdict: 0.9, fairness: 1 };
const FIELDS = ['years_experience', 'notice_days', 'expected_salary', 'relocation_ok', 'negotiation_outcome', 'agreed_salary'];
const VERDICTS = ['Strong', 'Maybe', 'Reject'];
const NAMES = ['Riya Sharma', 'Mohammed Iqbal', 'John Fernandes', 'Gurpreet Kaur', 'Lakshmi Venkataraman', 'Tenzin Dorje'];

const { jobs, cases } = JSON.parse(readFileSync(fileURLToPath(new URL('./cases.json', import.meta.url)), 'utf8'));

function runCase(c, name = 'Test Candidate') {
  const answers = answersFromDograh({ gathered_context: c.said });
  answers.evidence_text = c.said.skill_example || '';
  const result = scoreCandidate({ name, ...c.form }, jobs[c.job], answers);
  return { answers, result };
}

const field = { hit: 0, total: 0, misses: [] };
const confusion = Object.fromEntries(VERDICTS.map(v => [v, Object.fromEntries(VERDICTS.map(w => [w, 0]))]));
let verdictHits = 0, flagHits = 0, flagTotal = 0, fairHits = 0;
const rows = [], scores = {};

for (const c of cases) {
  const { answers, result } = runCase(c);
  scores[c.id] = result.total;
  for (const f of FIELDS) {
    if (!(f in c.expect) || c.expect.skip?.includes(f)) continue;
    field.total++;
    if (answers[f] === c.expect[f]) field.hit++; else field.misses.push(`${c.id}.${f}: expected ${c.expect[f]}, got ${answers[f]}`);
  }
  const ok = result.verdict === c.expect.verdict;
  verdictHits += ok; confusion[c.expect.verdict][result.verdict] = (confusion[c.expect.verdict][result.verdict] || 0) + 1;
  let flagOk = null;
  if (c.expect.flag) { flagTotal++; flagOk = result.flags.some(x => x.text === c.expect.flag); flagHits += flagOk; }
  const fair = new Set(NAMES.map(n => runCase(c, n).result.total)).size === 1;
  fairHits += fair;
  rows.push({ id: c.id, expected: c.expect.verdict, got: result.verdict, score: result.total, ok, flag: flagOk, fair });
}
// Pairs that must score identically (for example: the same answer with and without personal details).
const pairs = cases.filter(c => c.expect.same_score_as).map(c => ({ id: c.id, ok: scores[c.id] === scores[c.expect.same_score_as], a: scores[c.id], b: scores[c.expect.same_score_as] }));

const summary = {
  rubric_version: RUBRIC_VERSION, cases: cases.length,
  extraction_accuracy: field.hit / field.total, verdict_accuracy: verdictHits / cases.length,
  flag_recall: flagTotal ? flagHits / flagTotal : 1,
  fairness: (fairHits + pairs.filter(p => p.ok).length) / (cases.length + pairs.length),
};
const pass = summary.extraction_accuracy >= GATES.extraction && summary.verdict_accuracy >= GATES.verdict && summary.fairness >= GATES.fairness;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ summary, gates: GATES, pass, rows, pairs, misses: field.misses, confusion }, null, 2));
} else {
  const pct = x => `${(x * 100).toFixed(1)}%`;
  console.log(`\nInterview pipeline eval  (rubric ${RUBRIC_VERSION}, ${cases.length} cases)\n`);
  console.log('case                        expected  got      score  flag  fair');
  for (const r of rows) console.log(`${r.ok ? '  ' : 'x '}${r.id.padEnd(26)}${r.expected.padEnd(10)}${r.got.padEnd(9)}${String(r.score).padStart(5)}  ${r.flag === null ? '  - ' : r.flag ? ' ok ' : 'MISS'}  ${r.fair ? 'ok' : 'BIASED'}`);
  console.log('\nconfusion (rows = expected, columns = predicted)');
  console.log('          ' + VERDICTS.map(v => v.padStart(8)).join(''));
  for (const v of VERDICTS) console.log(v.padEnd(10) + VERDICTS.map(w => String(confusion[v][w]).padStart(8)).join(''));
  for (const p of pairs) console.log(`\npair ${p.id}: ${p.a} vs ${p.b} ${p.ok ? 'identical' : 'DIFFERENT'}`);
  for (const m of field.misses) console.log(`miss  ${m}`);
  console.log(`\nextraction ${pct(summary.extraction_accuracy)} (gate ${pct(GATES.extraction)})   verdict ${pct(summary.verdict_accuracy)} (gate ${pct(GATES.verdict)})   flag recall ${pct(summary.flag_recall)}   fairness ${pct(summary.fairness)} (gate ${pct(GATES.fairness)})`);
  console.log(pass ? 'PASS\n' : 'FAIL\n');
}
process.exit(pass ? 0 : 1);
