// Public TURN relay credentials for browser interviews, so candidates on other networks
// can reach the voice engine. Cloudflare TURN (free tier) first, Twilio Network Traversal second.
// Credentials last 4 hours and are reused for 1.
import { envStr } from '../lib/config.js';
import { retry } from '../lib/resilience.js';

const turnOnly = urls => [].concat(urls || []).filter(u => /^turns?:/.test(u));

export function createRelay({ trace, fetchImpl = fetch }) {
  let cache = { at: 0, servers: [] };

  async function cloudflare(id, token) {
    const r = await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`, {
      method: 'POST', body: JSON.stringify({ ttl: 14400 }), signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Cloudflare TURN: ${d.error || d.message || `HTTP ${r.status}`}`), { status: r.status });
    return [].concat(d.iceServers || []).map(s => ({ urls: turnOnly(s.urls), username: s.username, credential: s.credential })).filter(s => s.urls.length);
  }

  async function twilio(sid, token) {
    const r = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Tokens.json`, {
      method: 'POST', body: new URLSearchParams({ Ttl: '14400' }), signal: AbortSignal.timeout(8000),
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Twilio: ${d.message || `HTTP ${r.status}`}`), { status: r.status });
    return (d.ice_servers || []).filter(s => turnOnly(s.urls || s.url).length).map(s => ({ urls: s.urls || s.url, username: s.username, credential: s.credential }));
  }

  /** @returns {Promise<Array<{urls: string|string[], username: string, credential: string}>>} never throws */
  async function iceServers() {
    const cf = [envStr('CLOUDFLARE_TURN_KEY_ID'), envStr('CLOUDFLARE_TURN_API_TOKEN')];
    const tw = [envStr('TWILIO_ACCOUNT_SID'), envStr('TWILIO_AUTH_TOKEN')];
    const providers = [cf.every(Boolean) && (() => cloudflare(...cf)), tw.every(Boolean) && (() => twilio(...tw))].filter(Boolean);
    if (!providers.length) return [];
    if (Date.now() - cache.at < 3600e3 && cache.servers.length) return cache.servers;
    for (const p of providers) {
      try {
        const servers = await retry(p, { attempts: 2 });
        if (servers.length) { cache = { at: Date.now(), servers }; return servers; }
      } catch (e) { trace('relay_error', { error: String(e.message || e).slice(0, 200) }); }
    }
    return [];
  }

  return { iceServers };
}
