// Sets up the low-cost voice pipeline in Dograh: Deepgram (speech to text) + Groq (brain) + Rumik Silk (voice).
// Creates or updates one provider connection per vendor from .env, and one named model configuration that uses
// them. It changes nothing that calls use unless you pass a target:
//
//   node scripts/setup-voice-stack.mjs                      create/update connections + configuration only
//   node scripts/setup-voice-stack.mjs --workflow=7         make workflow 7 run on it (a per-workflow override)
//   node scripts/setup-voice-stack.mjs --workflow=7 --off   put workflow 7 back on the organisation default
//   node scripts/setup-voice-stack.mjs --default            make it the organisation default (every agent)
//
// Rumik is not a stock Dograh provider: Dograh must run the overlay image from dograh/overlay/rumik.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, DOGRAH } from '../lib/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(ROOT);
const arg = k => process.argv.find(a => a === `--${k}` || a.startsWith(`--${k}=`))?.split('=')[1] ?? (process.argv.includes(`--${k}`) ? true : undefined);
const env = (k, d = '') => String(process.env[k] ?? d).trim();
export const CONFIG_NAME = 'Hirevox voice: Deepgram + Groq + Rumik';

async function call(method, p, body) {
  const r = await fetch(`${DOGRAH.base}${p}`, { method, headers: { 'Content-Type': 'application/json', 'X-API-Key': DOGRAH.apiKey }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} failed (${r.status}): ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : null;
}

const MC = '/api/v1/model-connections';
const VENDORS = [
  { role: 'stt', name: 'Hirevox Deepgram', provider: 'deepgram', key: 'DEEPGRAM_API_KEY',
    settings: { model: env('DEEPGRAM_MODEL', 'nova-3-general'), language: env('DEEPGRAM_LANGUAGE', 'multi') } },
  { role: 'llm', name: 'Hirevox Groq', provider: 'groq', key: process.env.VOICE_GROQ_API_KEY ? 'VOICE_GROQ_API_KEY' : 'GROQ_API_KEY',
    settings: { model: env('VOICE_LLM_MODEL', 'openai/gpt-oss-120b'), temperature: Number(env('VOICE_LLM_TEMPERATURE', '0.3')) } },
  { role: 'tts', name: 'Hirevox Rumik', provider: 'rumik', key: 'RUMIK_API_KEY',
    settings: {
      model: env('RUMIK_MODEL', 'mulberry'), voice: env('RUMIK_VOICE'),
      description: env('RUMIK_DESCRIPTION', "a warm, clear young Indian woman's voice, friendly and professional, natural conversational pace, speaking Indian English and Hinglish"),
    } },
];

if (!DOGRAH.base || !DOGRAH.apiKey) throw new Error('Set DOGRAH_BASE_URL and DOGRAH_API_KEY first.');
const missing = VENDORS.filter(v => !env(v.key)).map(v => v.key);
if (missing.length) throw new Error(`Add ${missing.join(', ')} to .env first.`);

const catalog = await call('GET', `${MC}/catalog`);
if (!JSON.stringify(catalog).includes('"rumik"')) throw new Error('Dograh does not know Rumik: run the overlay image from dograh/overlay/rumik (see its README).');

// 1. Provider connections, matched by name, so re-running rotates keys instead of duplicating.
const existing = await call('GET', `${MC}/provider-connections`);
const selection = {};
for (const v of VENDORS) {
  const credentials = { api_key: env(v.key) };
  const found = existing.find(c => c.name === v.name && c.provider === v.provider);
  const conn = found
    ? await call('PATCH', `${MC}/provider-connections/${found.uuid}`, { credentials, revision: found.revision })
    : await call('POST', `${MC}/provider-connections`, { name: v.name, provider: v.provider, credentials });
  const settings = Object.fromEntries(Object.entries(v.settings).filter(([, x]) => x !== '' && !Number.isNaN(x)));
  selection[v.role] = { provider_connection_uuid: conn.uuid, settings };
  console.log(`${found ? 'Updated' : 'Created'} connection ${v.name} (${v.provider}): ${JSON.stringify(settings)}`);
}

// 2. One named configuration. Embeddings stay on Dograh (only used by knowledge-base agents).
const configs = await call('GET', `${MC}/model-configurations`);
const orgDefault = configs.find(c => c.name === 'Organization default');
const configuration = { version: 3, mode: 'pipeline', ...selection, ...(orgDefault?.configuration?.embeddings ? { embeddings: orgDefault.configuration.embeddings } : {}) };
const current = configs.find(c => c.name === CONFIG_NAME);
const cfg = current
  ? await call('PATCH', `${MC}/model-configurations/${current.uuid}`, { configuration, revision: current.revision })
  : await call('POST', `${MC}/model-configurations`, { name: CONFIG_NAME, configuration });
console.log(`${current ? 'Updated' : 'Created'} model configuration "${CONFIG_NAME}" (${cfg.uuid})`);

// 3. Optional targets.
const wid = arg('workflow');
if (wid && wid !== true) {
  const live = await call('GET', `/api/v1/workflow/fetch/${wid}`);
  const wc = { ...(live.workflow_configurations || {}) };
  if (arg('off')) delete wc.model_configuration_override;
  else wc.model_configuration_override = { model_configuration_uuid: cfg.uuid };
  await call('POST', `/api/v1/workflow/${wid}/create-draft`).catch(() => {});
  await call('PUT', `/api/v1/workflow/${wid}`, { name: live.name, workflow_definition: live.workflow_definition, workflow_configurations: wc });
  await call('POST', `/api/v1/workflow/${wid}/publish`).catch(e => { if (!/No draft to publish/i.test(String(e.message))) throw e; });
  console.log(`Workflow ${wid} ("${live.name}") now runs on ${arg('off') ? 'the organisation default' : CONFIG_NAME}.`);
}
if (arg('default')) {
  await call('PUT', `${MC}/default`, { model_configuration_uuid: cfg.uuid });
  console.log(`Organisation default is now "${CONFIG_NAME}". Roll back: PUT ${MC}/default with ${orgDefault?.uuid}`);
}
