// The first line of a partner-outreach call. Dograh speaks it the moment the call is answered (the Start node's
// greeting, no AI round-trip), so it is written out per language here and passed in as the `opening_line` call
// variable. Calls without it fall back to the Gujarati line in scripts/setup-outreach.mjs.
const LINES = {
  gujarati: a => `Hello, shu hu ${a} sathe vaat kari rahi chu?`,
  hindi: a => `Hello, kya main ${a} se baat kar rahi hoon?`,
  english: a => `Hello, am I speaking with ${a}?`,
};

export function openingLine(language, agencyName) {
  const lang = String(language || '').trim().toLowerCase();
  const agency = String(agencyName || '').replace(/[{}]/g, '').trim();
  const make = LINES[lang] || LINES.gujarati;
  return make(agency || (lang === 'english' ? 'your agency' : lang === 'hindi' ? 'aapki agency' : 'tamari agency'));
}
