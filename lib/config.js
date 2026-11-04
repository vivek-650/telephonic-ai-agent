// Configuration: .env loading plus typed, validated access to every setting.
// Values are read lazily from process.env, because the Settings page writes saved
// values back into process.env at runtime and they must apply without a restart.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Load KEY=VALUE lines from <root>/.env. Variables already in the environment win. */
export function loadEnvFile(root, env = process.env) {
  const file = path.join(root, '.env');
  if (!existsSync(file)) return 0;
  let n = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || m[1] in env) continue;
    let val = m[2].trim();
    if (!/^["']/.test(val)) val = val.replace(/\s+#.*$/, '');
    env[m[1]] = val.replace(/^["']|["']$/g, '');
    n++;
  }
  return n;
}

export const envStr = (k, d = '') => String(process.env[k] ?? d);
export const envNum = (k, d) => { const v = process.env[k]; const n = Number(v); return v === undefined || v === '' || !Number.isFinite(n) ? d : n; };
export const envBool = (k, d = false) => { const v = process.env[k]; return v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v); };

/** Dograh (voice engine) settings. Getters so Settings-page changes apply live. */
export const DOGRAH = {
  get base() { return envStr('DOGRAH_BASE_URL').replace(/\/+$/, '').replace(/\/api\/v1$/, ''); },
  get apiKey() { return envStr('DOGRAH_API_KEY'); },
  get agentUuid() { return envStr('DOGRAH_AGENT_UUID'); }, // workflow uuid for screens
  get refAgentUuid() { return envStr('DOGRAH_REFERENCE_AGENT_UUID'); },
  get reminderAgentUuid() { return envStr('DOGRAH_REMINDER_AGENT_UUID'); },
  get rejectionAgentUuid() { return envStr('DOGRAH_REJECTION_AGENT_UUID'); },
  get embedToken() { return envStr('DOGRAH_EMBED_TOKEN'); }, // browser interview widget token
  get webhookSecret() { return envStr('WEBHOOK_SECRET'); },
  get workflowId() { return envNum('DOGRAH_WORKFLOW_ID', 1); },
  get rejectionWorkflowId() { return envNum('DOGRAH_REJECTION_WORKFLOW_ID', 0); },
  get phoneReady() { return Boolean(this.base && this.apiKey && this.agentUuid); },
  get webReady() { return Boolean(this.base && this.embedToken); },
};

/**
 * Check the settings that would make the server misbehave. Returns a list of
 * problems; `fatal` ones stop the boot, the rest are logged as warnings.
 */
export function validateConfig(env = process.env) {
  const problems = [];
  const port = Number(env.PORT || 4870);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push({ fatal: true, key: 'PORT', message: `PORT must be 1-65535, got "${env.PORT}"` });
  for (const k of ['DOGRAH_BASE_URL', 'PUBLIC_BASE_URL']) {
    if (env[k] && !/^https?:\/\/[^\s]+$/.test(env[k])) problems.push({ fatal: true, key: k, message: `${k} must be an http(s) URL` });
  }
  if (env.DOGRAH_WORKFLOW_ID && !Number.isInteger(Number(env.DOGRAH_WORKFLOW_ID))) problems.push({ fatal: true, key: 'DOGRAH_WORKFLOW_ID', message: 'DOGRAH_WORKFLOW_ID must be an integer' });
  if (env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length < 10) problems.push({ fatal: false, key: 'ADMIN_PASSWORD', message: 'ADMIN_PASSWORD is shorter than 10 characters' });
  if (env.ADMIN_PASSWORD && !env.SESSION_SECRET) problems.push({ fatal: false, key: 'SESSION_SECRET', message: 'SESSION_SECRET is not set: sessions are signed with the password itself' });
  if (env.PUBLIC_BASE_URL && !env.WEBHOOK_SECRET) problems.push({ fatal: false, key: 'WEBHOOK_SECRET', message: 'WEBHOOK_SECRET is not set: anyone who can reach the webhook can post call results' });
  if (env.IMPORT_CALL_ANY === '1') problems.push({ fatal: false, key: 'IMPORT_CALL_ANY', message: 'Production calling is on: the call allowlist is bypassed' });
  return problems;
}
