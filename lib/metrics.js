// In-process metrics in the Prometheus text format (served at /metrics).
// Counters and histograms only: enough to graph request rate, latency,
// error rate, interview outcomes and dependency health.

const key = labels => Object.entries(labels).sort().map(([k, v]) => `${k}="${String(v).replace(/["\\\n]/g, '_')}"`).join(',');

export function createMetrics() {
  const counters = new Map(), hists = new Map(), help = new Map();
  const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

  const inc = (name, labels = {}, by = 1) => {
    const m = counters.get(name) || new Map(); counters.set(name, m);
    const k = key(labels); m.set(k, (m.get(k) || 0) + by);
  };
  const observe = (name, labels, seconds) => {
    const m = hists.get(name) || new Map(); hists.set(name, m);
    const k = key(labels);
    const h = m.get(k) || { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
    BUCKETS.forEach((b, i) => { if (seconds <= b) h.buckets[i]++; });
    h.sum += seconds; h.count++; m.set(k, h);
  };
  const describe = (name, text) => help.set(name, text);

  function render(gauges = {}) {
    const out = [];
    for (const [name, m] of counters) {
      if (help.has(name)) out.push(`# HELP ${name} ${help.get(name)}`);
      out.push(`# TYPE ${name} counter`);
      for (const [k, v] of m) out.push(`${name}${k ? `{${k}}` : ''} ${v}`);
    }
    for (const [name, m] of hists) {
      if (help.has(name)) out.push(`# HELP ${name} ${help.get(name)}`);
      out.push(`# TYPE ${name} histogram`);
      for (const [k, h] of m) {
        const pre = k ? `${k},` : '';
        BUCKETS.forEach((b, i) => out.push(`${name}_bucket{${pre}le="${b}"} ${h.buckets[i]}`));
        out.push(`${name}_bucket{${pre}le="+Inf"} ${h.count}`, `${name}_sum${k ? `{${k}}` : ''} ${h.sum.toFixed(6)}`, `${name}_count${k ? `{${k}}` : ''} ${h.count}`);
      }
    }
    for (const [name, v] of Object.entries(gauges)) out.push(`# TYPE ${name} gauge`, `${name} ${Number(v) || 0}`);
    return out.join('\n') + '\n';
  }
  /** Read back one counter (tests, the engine room). */
  const value = (name, labels = {}) => counters.get(name)?.get(key(labels)) || 0;
  return { inc, observe, describe, render, value };
}

export const metrics = createMetrics();
metrics.describe('http_requests_total', 'HTTP requests by method, route and status');
metrics.describe('http_request_duration_seconds', 'HTTP request latency');
metrics.describe('screenings_total', 'Interviews by mode and outcome');
metrics.describe('dograh_requests_total', 'Calls to the Dograh API by outcome');
metrics.describe('webhooks_total', 'Dograh webhooks by outcome');
