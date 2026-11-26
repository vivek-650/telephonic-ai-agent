// Sets up the low-cost voice pipeline in Dograh: Deepgram (speech to text) + Groq (brain) + Rumik Silk (voice).
// Creates or updates one provider connection per vendor from .env, and one named model configuration that uses
// them. It changes nothing that calls use unless you pass a target:
//
//   node scripts/setup-voice-stack.mjs                      create/update connections + configuration only
//   node scripts/setup-voice-stack.mjs --workflow=7         make workflow 7 run on it (a per-workflow override)
//   node scripts/setup-voice-stack.mjs --workflow=7 --off   put workflow 7 back on the organisation default
//   node scripts/setup-voice-stack.mjs --default            make it the organisation default (every agent)
//   add --llm=dograh to keep Dograh's own AI model as the brain (Deepgram + Dograh + Rumik): any prompt size works,
//   and Dograh credits are charged for the brain only. That is a separate configuration, so both can exist.
//   Its tier comes from DOGRAH_LLM_MODEL (default "fast"; "default" is a slower reasoning model).
//   add --mouth=oogam to speak with Oogam Naad TTS instead of Rumik (OOGAM_API_KEY, OOGAM_VOICE, OOGAM_LANGUAGE). Needs the
//   overlay image from dograh/overlay/oogam. Also a separate configuration.
//
// Groq free tier: 8,000 tokens per minute and 1,000 requests a day, per model, and cached tokens still count. Every
// reply resends the whole prompt, so the screener prompt (~6,000 tokens) fits about one reply a minute there. On a
// rate-limit error Dograh retries the reply on a second Groq model (VOICE_LLM_FALLBACK_MODEL).
//
// Rumik is not a stock Dograh provider: Dograh must run the overlay image from dograh/overlay/rumik.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, DOGRAH } from '../lib/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(ROOT);
const arg = k => process.argv.find(a => a === `--${k}` || a.startsWith(`--${k}=`))?.split('=')[1] ?? (process.argv.includes(`--${k}`) ? true : undefined);
const env = (k, d = '') => String(process.env[k] ?? d).trim();
const DOGRAH_LLM = arg('llm') === 'dograh';
// --ear=groq: Groq's hosted Whisper as the ear, through Dograh's OpenAI-compatible speech-to-text. It transcribes each
// caller turn after they stop speaking (not live), so only caller speech is billed; free up to 7,200 audio seconds an
// hour and 2,000 requests a day per account, then about $0.04 an audio hour.
const GROQ_EAR = arg('ear') === 'groq';
const DOGRAH_EAR = arg('ear') === 'dograh'; // Dograh's own speech-to-text (Flux multilingual), billed in Dograh credits
// --mouth=oogam: Oogam Naad TTS (streams 24 kHz PCM). It reads Roman-letter text in the configured 3-letter language.
const OOGAM_MOUTH = arg('mouth') === 'oogam';
export const CONFIG_NAME = `Hirevox voice: ${GROQ_EAR ? 'Groq Whisper' : DOGRAH_EAR ? 'Dograh ear' : 'Deepgram'} + ${DOGRAH_LLM ? 'Dograh AI' : 'Groq'} + ${OOGAM_MOUTH ? 'Oogam' : 'Rumik'}`;

async function call(method, p, body) {
  const r = await fetch(`${DOGRAH.base}${p}`, { method, headers: { 'Content-Type': 'application/json', 'X-API-Key': DOGRAH.apiKey }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} failed (${r.status}): ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : null;
}

const MC = '/api/v1/model-connections';
const VENDORS = [
  GROQ_EAR
    ? { role: 'stt', name: 'Hirevox Groq Whisper', provider: 'openai', key: process.env.VOICE_GROQ_API_KEY ? 'VOICE_GROQ_API_KEY' : 'GROQ_API_KEY',
      connection: { base_url: 'https://api.groq.com/openai/v1' }, settings: { model: env('GROQ_STT_MODEL', 'whisper-large-v3-turbo') } }
    : { role: 'stt', name: 'Hirevox Deepgram', provider: 'deepgram', key: 'DEEPGRAM_API_KEY',
      settings: { model: env('DEEPGRAM_MODEL', 'nova-3-general'), language: env('DEEPGRAM_LANGUAGE', 'multi') } },
  { role: 'llm', name: 'Hirevox Groq', provider: 'groq', key: process.env.VOICE_GROQ_API_KEY ? 'VOICE_GROQ_API_KEY' : 'GROQ_API_KEY',
    settings: { model: env('VOICE_LLM_MODEL', 'openai/gpt-oss-120b'), temperature: Number(env('VOICE_LLM_TEMPERATURE', '0.3')) } },
  OOGAM_MOUTH
    ? { role: 'tts', name: 'Hirevox Oogam', provider: 'oogam', key: 'OOGAM_API_KEY',
      settings: { model: env('OOGAM_MODEL', 'naad-tts-v2'), voice: env('OOGAM_VOICE', 'aditi'), language: env('OOGAM_LANGUAGE', 'GUJ') } }
    : { role: 'tts', name: 'Hirevox Rumik', provider: 'rumik', key: 'RUMIK_API_KEY',
    settings: {
      model: env('RUMIK_MODEL', 'mulberry'), voice: env('RUMIK_VOICE', 'speaker_2'), // a fixed speaker keeps the voice the same on every reply
      description: env('RUMIK_DESCRIPTION', "a warm, clear young Indian woman's voice, friendly and professional, natural conversational pace, speaking Indian English and Hinglish"),
    } },
].filter(v => !(DOGRAH_LLM && v.role === 'llm') && !(DOGRAH_EAR && v.role === 'stt'));

if (!DOGRAH.base || !DOGRAH.apiKey) throw new Error('Set DOGRAH_BASE_URL and DOGRAH_API_KEY first.');
const missing = VENDORS.filter(v => !env(v.key)).map(v => v.key);
if (missing.length) throw new Error(`Add ${missing.join(', ')} to .env first.`);

const catalog = await call('GET', `${MC}/catalog`);
if (!JSON.stringify(catalog).includes('"rumik"')) throw new Error('Dograh does not know Rumik: run the overlay image from dograh/overlay/rumik (see its README).');
if (OOGAM_MOUTH && !JSON.stringify(catalog).includes('"oogam"')) throw new Error('Dograh does not know Oogam: run the overlay image from dograh/overlay/oogam (see its README).');

// 1. Provider connections, matched by name, so re-running rotates keys instead of duplicating.
const existing = await call('GET', `${MC}/provider-connections`);
const selection = {};
for (const v of VENDORS) {
  const credentials = { api_key: env(v.key) };
  const found = existing.find(c => c.name === v.name && c.provider === v.provider);
  const conn = found
    ? await call('PATCH', `${MC}/provider-connections/${found.uuid}`, { credentials, ...(v.connection ? { connection_settings: v.connection } : {}), revision: found.revision })
    : await call('POST', `${MC}/provider-connections`, { name: v.name, provider: v.provider, credentials, ...(v.connection ? { connection_settings: v.connection } : {}) });
  const settings = Object.fromEntries(Object.entries(v.settings).filter(([, x]) => x !== '' && !Number.isNaN(x)));
  selection[v.role] = { provider_connection_uuid: conn.uuid, settings };
  console.log(`${found ? 'Updated' : 'Created'} connection ${v.name} (${v.provider}): ${JSON.stringify(settings)}`);
}

// 2. One named configuration. Embeddings stay on Dograh (only used by knowledge-base agents).
const configs = await call('GET', `${MC}/model-configurations`);
const orgDefault = configs.find(c => c.name === 'Organization default');
if (DOGRAH_EAR) {
  if (!orgDefault?.configuration?.stt) throw new Error('No "Organization default" configuration with a Dograh ear to reuse.');
  selection.stt = { ...orgDefault.configuration.stt, settings: { language: 'multi', language_hints: ['en', 'hi'] } };
  console.log('Ear: Dograh speech-to-text from the organisation default (English + Hindi hints)');
}
if (DOGRAH_LLM) {
  if (!orgDefault?.configuration?.llm) throw new Error('No "Organization default" configuration with a Dograh model to reuse.');
  // Tier "fast" by default: on the outreach conversation it answers in 0.43 s (median) against 1.05 s for "default",
  // which is a reasoning model and was the largest part of every reply's delay (26 Nov 2026 latency analysis).
  const tier = env('DOGRAH_LLM_MODEL', 'fast');
  selection.llm = { ...orgDefault.configuration.llm, settings: { ...(orgDefault.configuration.llm.settings || {}), model: tier } };
  console.log(`Brain: Dograh model, tier "${tier}" (DOGRAH_LLM_MODEL)`);
}
const fallbackModel = DOGRAH_LLM ? '' : env('VOICE_LLM_FALLBACK_MODEL', 'openai/gpt-oss-20b');
const llm_fallback = fallbackModel && fallbackModel !== selection.llm.settings.model
  ? { version: 1, rules: [{ condition: { type: 'error' }, target: { provider_connection_uuid: selection.llm.provider_connection_uuid, settings: { ...selection.llm.settings, model: fallbackModel } } }] }
  : null;
const configuration = { version: 3, mode: 'pipeline', ...selection, ...(llm_fallback ? { llm_fallback } : {}), ...(orgDefault?.configuration?.embeddings ? { embeddings: orgDefault.configuration.embeddings } : {}) };
const current = configs.find(c => c.name === CONFIG_NAME);
const cfg = current
  ? await call('PATCH', `${MC}/model-configurations/${current.uuid}`, { configuration, revision: current.revision })
  : await call('POST', `${MC}/model-configurations`, { name: CONFIG_NAME, configuration });
console.log(`${current ? 'Updated' : 'Created'} model configuration "${CONFIG_NAME}" (${cfg.uuid})${llm_fallback ? `, falls back to ${fallbackModel} on errors` : ''}`);

// 3. Optional targets.
const wid = arg('workflow');
if (wid && wid !== true) {
  const live = await call('GET', `/api/v1/workflow/fetch/${wid}`);
  const wc = { ...(live.workflow_configurations || {}) };
  const def = live.workflow_definition;
  const size = Math.ceil(def.nodes.filter(n => n.type === 'globalNode' || n.type === 'startCall').reduce((t, n) => t + String(n.data?.prompt || '').length, 0) / 4);
  if (!arg('off') && !DOGRAH_LLM && size > 2500) console.warn(`Warning: this agent's prompt is ~${size} tokens. On the Groq free tier (8,000 tokens a minute) that leaves room for about ${Math.max(1, Math.floor(8000 / size))} reply a minute. Too big for a real call on the free tier; keep this agent on Dograh's models.`);
  if (arg('off')) wc.model_configuration_override = {}; // omitting the key keeps the stored override; {} means inherit the default
  else wc.model_configuration_override = { model_configuration_uuid: cfg.uuid };
  await call('POST', `/api/v1/workflow/${wid}/create-draft`).catch(() => {});
  await call('PUT', `/api/v1/workflow/${wid}`, { name: live.name, workflow_definition: def, workflow_configurations: wc });
  await call('POST', `/api/v1/workflow/${wid}/publish`).catch(e => { if (!/No draft to publish/i.test(String(e.message))) throw e; });
  console.log(`Workflow ${wid} ("${live.name}") now runs on ${arg('off') ? 'the organisation default' : CONFIG_NAME}.`);
}
if (arg('default')) {
  await call('PUT', `${MC}/default`, { model_configuration_uuid: cfg.uuid });
  console.log(`Organisation default is now "${CONFIG_NAME}". Roll back: PUT ${MC}/default with ${orgDefault?.uuid}`);
}
