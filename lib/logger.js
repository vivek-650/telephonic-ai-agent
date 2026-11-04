// Structured logger: one JSON object per line in production (LOG_FORMAT=json),
// readable single lines in a terminal. Secrets and personal data are redacted
// before anything is written.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const SECRET_KEY = /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|credential)/i;

/** Mask emails and phone numbers inside free text. */
export const redactText = s => String(s)
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
  .replace(/\+?\d[\d\s().-]{8,}\d/g, m => (m.replace(/\D/g, '').length >= 10 ? '[phone]' : m));

/** Deep copy of `v` with secret-looking keys masked and PII scrubbed from strings. */
export function redact(v, depth = 0) {
  if (depth > 6) return '[depth]';
  if (typeof v === 'string') return redactText(v).slice(0, 2000);
  if (Array.isArray(v)) return v.slice(0, 50).map(x => redact(x, depth + 1));
  if (v instanceof Error) return { name: v.name, message: redactText(v.message), ...(v.code ? { code: v.code } : {}) };
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = SECRET_KEY.test(k) && x ? '[redacted]' : redact(x, depth + 1);
    return out;
  }
  return v;
}

/**
 * @param {{ level?: string, format?: 'json'|'pretty', base?: object, write?: (line: string) => void }} [opts]
 */
export function createLogger(opts = {}) {
  const min = LEVELS[opts.level || process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;
  const json = (opts.format || process.env.LOG_FORMAT) === 'json';
  const write = opts.write || (line => process.stdout.write(line + '\n'));
  const base = opts.base || {};
  const emit = (level, msg, fields) => {
    if (LEVELS[level] < min) return;
    const rec = { t: new Date().toISOString(), level, msg, ...base, ...redact(fields || {}) };
    if (json) return write(JSON.stringify(rec));
    const extra = Object.entries(rec).filter(([k]) => !['t', 'level', 'msg'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
    write(`${rec.t.slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${msg}${extra ? ' ' + extra : ''}`);
  };
  return {
    debug: (m, f) => emit('debug', m, f), info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f), error: (m, f) => emit('error', m, f),
    child: extra => createLogger({ ...opts, base: { ...base, ...extra } }),
  };
}

export const log = createLogger();
