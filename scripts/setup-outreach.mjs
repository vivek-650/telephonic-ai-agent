// Creates or updates the RecruitX partner-outreach voice agent in Dograh (dograh/outreach/partner-outreach-prompt.txt).
// Calls are capped at 3 minutes; every call keeps Dograh's recording and transcript. It runs on the named model
// configuration given by --stack (default: Deepgram + Dograh AI + Rumik, see scripts/setup-voice-stack.mjs).
//   node scripts/setup-outreach.mjs                 create the agent (prints its id and uuid)
//   node scripts/setup-outreach.mjs --workflow=12   update that agent in place
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, DOGRAH } from '../lib/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(ROOT);
const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const NAME = 'RecruitX partner outreach';
const STACK = arg('stack') || 'Hirevox voice: Deepgram + Dograh AI + Rumik';

async function call(method, p, body) {
  const r = await fetch(`${DOGRAH.base}${p}`, { method, headers: { 'Content-Type': 'application/json', 'X-API-Key': DOGRAH.apiKey }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} failed (${r.status}): ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : null;
}

const v = (name, type, prompt) => ({ name, type, prompt });
const definition = {
  nodes: [
    {
      id: 'start', type: 'startCall', position: { x: 0, y: 0 },
      data: {
        name: 'Outreach', prompt: readFileSync(path.join(ROOT, 'dograh', 'outreach', 'partner-outreach-prompt.txt'), 'utf8').trim(),
        allow_interrupt: true, add_global_prompt: false, extraction_enabled: true,
        extraction_prompt: 'Extract only what was actually said on the call. Use an empty value or false when it was not discussed; never guess.',
        extraction_variables: [
          v('reached_agency', 'boolean', 'True if the person confirmed this is the agency (or speaks for it).'),
          v('interested', 'string', 'One of: yes, maybe, no, not_reached. yes = agreed to a meeting or clearly interested; maybe = wants details first or unsure.'),
          v('meeting_time', 'string', 'The day and time agreed for the 15-minute meeting, in their words. Empty if none.'),
          v('contact_name', 'string', 'Name of the person to meet or who spoke, if given.'),
          v('contact_role', 'string', 'Their role at the agency (owner, HR manager...), if given.'),
          v('callback_time', 'string', 'When to call back if they were busy, in their words. Empty if none.'),
          v('email_or_whatsapp', 'string', 'Email or WhatsApp number they gave for details. Empty if none.'),
          v('objection', 'string', 'Main reason for not being interested, or the main question they asked. Empty if none.'),
          v('do_not_call', 'boolean', 'True if they asked not to be called again.'),
          v('language_used', 'string', 'Main language of the call: gujarati, hindi or english.'),
          v('summary', 'string', 'One or two sentences on how the call went, for a reviewer.'),
        ],
      },
    },
    { id: 'end', type: 'endCall', position: { x: 0, y: 200 }, data: { name: 'End call', prompt: 'The conversation is over and you have already said goodbye. Reply with only this word: "Bye!" Say nothing else.' /* test call 320 read the old wording aloud */, add_global_prompt: false } },
  ],
  edges: [{ id: 'start-end', source: 'start', target: 'end', data: { label: 'End call', condition: 'Call this right after your goodbye, or whenever the call flow says to end the call (wrong number, busy, not interested, do not call, voicemail).' } }],
};

const configs = await call('GET', '/api/v1/model-connections/model-configurations');
const stack = configs.find(c => c.name === STACK);
if (!stack) throw new Error(`No model configuration named "${STACK}". Run scripts/setup-voice-stack.mjs first.`);
const workflow_configurations = {
  max_call_duration: 180, max_user_idle_timeout: 10,
  voicemail_detection: { enabled: true, voicemail_action: 'hangup' },
  model_configuration_override: { model_configuration_uuid: stack.uuid },
};

let wid = arg('workflow');
if (!wid) wid = (await call('POST', '/api/v1/workflow/create/definition', { name: NAME, workflow_definition: definition })).id;
await call('POST', `/api/v1/workflow/${wid}/create-draft`).catch(() => {});
await call('PUT', `/api/v1/workflow/${wid}`, { name: NAME, workflow_definition: definition, workflow_configurations });
await call('POST', `/api/v1/workflow/${wid}/publish`).catch(e => { if (!/No draft to publish/i.test(String(e.message))) throw e; });
const live = await call('GET', `/api/v1/workflow/fetch/${wid}`);
console.log(`"${live.name}": workflow ${wid}, uuid ${live.workflow_uuid}, stack "${STACK}", limits ${JSON.stringify({ max_call_duration: 180, max_user_idle_timeout: 10 })}`);
