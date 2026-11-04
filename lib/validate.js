// A small schema validator (zod-like, zero dependencies). Each field rule
// returns a coerced value or pushes a human-readable error.
//
//   const Apply = object({ name: str({ max: 120 }), email: email(), years: num({ min: 0, optional: true }) });
//   const { value, errors } = Apply.parse(body);

const blank = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** @param {{ min?: number, max?: number, optional?: boolean, pattern?: RegExp, message?: string }} [opts] */
export const str = ({ min = 1, max = 10000, optional = false, pattern, message } = {}) => (v, key, errs) => {
  if (blank(v)) { if (!optional) errs.push(`${key} is required`); return undefined; }
  const s = String(v).trim();
  if (s.length < min) errs.push(`${key} must be at least ${min} characters`);
  if (pattern && !pattern.test(s)) { errs.push(message || `${key} is invalid`); return undefined; }
  return s.slice(0, max);
};

/** @param {{ optional?: boolean }} [opts] */
export const email = (opts = {}) => str({ max: 254, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'email is invalid', ...opts });
/** @param {{ optional?: boolean }} [opts] */
export const phone = (opts = {}) => str({ max: 20, pattern: /^\+?[0-9 ()-]{8,20}$/, message: 'phone is invalid', ...opts });

export const num = ({ min = -Infinity, max = Infinity, optional = true, integer = false } = {}) => (v, key, errs) => {
  if (blank(v)) { if (!optional) errs.push(`${key} is required`); return null; }
  const n = Number(v);
  if (!Number.isFinite(n)) { errs.push(`${key} must be a number`); return null; }
  if (integer && !Number.isInteger(n)) errs.push(`${key} must be a whole number`);
  if (n < min || n > max) errs.push(`${key} must be between ${min} and ${max}`);
  return n;
};

export const bool = ({ optional = true } = {}) => (v, key, errs) => {
  if (v === undefined || v === null) { if (!optional) errs.push(`${key} is required`); return undefined; }
  if (typeof v !== 'boolean') errs.push(`${key} must be true or false`);
  return v === true;
};

/** @param {any[]} values @param {{ optional?: boolean, fallback?: any }} [opts] */
export const oneOf = (values, { optional = false, fallback } = {}) => (v, key, errs) => {
  if (blank(v)) { if (!optional) errs.push(`${key} is required`); return fallback; }
  if (!values.includes(v)) errs.push(`${key} must be one of ${values.join(', ')}`);
  return v;
};

/** @param {Record<string, Function>} shape */
export const object = shape => ({
  shape,
  parse(input) {
    const errors = [], value = {};
    const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    for (const [key, rule] of Object.entries(shape)) {
      const v = rule(src[key], key, errors);
      if (v !== undefined) value[key] = v;
    }
    return { value, errors, ok: errors.length === 0 };
  },
});
