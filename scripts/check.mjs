// Static check: every JavaScript file parses. Run: npm run check
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'data', 'coverage', '.next', 'web']); // web/ is TypeScript, checked by next build
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    if (SKIP.has(f)) continue;
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js)$/.test(f)) files.push(p);
  }
})(ROOT);
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { bad++; console.error(`FAIL ${path.relative(ROOT, f)}\n${r.stderr}`); }
}
console.log(`${files.length - bad}/${files.length} files parse`);
process.exit(bad ? 1 : 0);
