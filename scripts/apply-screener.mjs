// Applies a screening workflow file to the live Dograh screener (DOGRAH_WORKFLOW_ID) through the same
// draft -> PUT -> publish path the server uses (services/dograh.js publish()). The live trigger path (the agent
// UUID calls go to) and the live webhook URL are kept, so nothing else needs to change.
// Usage: node scripts/apply-screener.mjs [dograh/workflow.json]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, DOGRAH } from '../lib/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(ROOT);
const file = process.argv.slice(2).find(a => !a.startsWith('--')) || 'dograh/workflow.json';
const LIMITS = { max_call_duration: 900, max_user_idle_timeout: 15 };

async function call(method, p, body) {
  const r = await fetch(`${DOGRAH.base}${p}`, { method, headers: { 'Content-Type': 'application/json', 'X-API-Key': DOGRAH.apiKey }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} failed (${r.status}): ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

const wid = DOGRAH.workflowId;
if (!DOGRAH.base || !DOGRAH.apiKey || !wid) throw new Error('Set DOGRAH_BASE_URL, DOGRAH_API_KEY and DOGRAH_WORKFLOW_ID first.');
const live = await call('GET', `/api/v1/workflow/fetch/${wid}`);
const def = JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
const liveOf = type => live.workflow_definition.nodes.find(n => n.type === type)?.data || {};
for (const n of def.nodes) {
  if (n.type === 'trigger') n.data = { ...n.data, trigger_path: liveOf('trigger').trigger_path };
  if (n.type === 'webhook') n.data.endpoint_url = liveOf('webhook').endpoint_url || n.data.endpoint_url;
}
if (def.nodes.some(n => n.type === 'webhook' && n.data.endpoint_url === '__WEBHOOK_URL__')) throw new Error('The live agent has no webhook URL to keep; run setup:dograh instead.');

await call('POST', `/api/v1/workflow/${wid}/create-draft`).catch(() => {}); // no draft needed is fine
await call('PUT', `/api/v1/workflow/${wid}`, { name: live.name, workflow_definition: def, workflow_configurations: (({ voicemail_detection, ...rest }) => ({ ...rest, ...LIMITS }))(live.workflow_configurations || {}) });
await call('POST', `/api/v1/workflow/${wid}/publish`).catch(e => { if (!/No draft to publish/i.test(String(e.message))) throw e; });

const after = await call('GET', `/api/v1/workflow/fetch/${wid}`);
const trig = after.workflow_definition.nodes.find(n => n.type === 'trigger')?.data?.trigger_path;
console.log(`Applied ${file} to "${after.name}" (workflow ${wid}): ${after.workflow_definition.nodes.length} nodes, trigger ${trig === liveOf('trigger').trigger_path ? 'kept' : 'CHANGED'}, limits ${JSON.stringify(after.workflow_configurations)}`);
