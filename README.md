# AI Recruiter OS

An AI interview platform you run yourself. Candidates apply on a careers page, or come in from a CSV export (Naukri, Indeed, anything). An AI recruiter then interviews each one by voice, in the browser or by phone. It reads their resume, asks resume-specific questions, can negotiate salary inside your budget, and scores them on an explainable 100-point rubric. Recruiters review a ranked pipeline and make every decision.

**Stack:** Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS 4 for the web app. A layered Node.js 22 API with built-in SQLite (`node:sqlite`). [Dograh](https://github.com/dograh-hq/dograh) (open source, Pipecat) is the voice engine, connected over WebRTC.

Bring your own keys. No monthly fee, no lock-in. The API has no runtime dependencies; the web app uses a small, pinned set (Next.js, React, Recharts, lucide, SWR).

## What you get

- **AI phone screen** built on [Dograh](https://github.com/dograh-hq/dograh) (open-source voice agents). It greets by first name, confirms the application, checks it is a good time, confirms details, then asks resume-specific questions.
- **A voice and a name per role**: pick the AI's voice (12 Gemini Live voices) and first name when you create a role or later from the role card. The app builds a dedicated copy of the screening agent for that voice automatically and keeps it in sync, so there is nothing to set up in Dograh. Every role also gets its own apply link (`/?role=ID`) from the role card.
- **Salary negotiation** per role: you set a budget, a stretch percentage and the reason the budget is tight. The AI states the budget, makes one capped counter and never promises an offer.
- **Rejection emails**: a personal email from your own mailbox (any SMTP provider) with the main reason, one real positive and an offer to keep their details. Preview and edit it, send one, or send to everyone rejected. Email is the recommended default because most candidates prefer to read bad news privately. Locked to an allowlist until you switch to production.
- **Rejection calls**: when a recruiter moves someone to Rejected they can have the AI phone the candidate with the decision: kind, short, one real positive and the main reason, with an offer to keep their details on file. Never automatic, always a click and a confirm.
- **CSV lead import**: drop an export from Naukri, Indeed or any board. Columns are matched by name, duplicates skipped, a resume is built from the row.
- **Call queue with a safety lock**: calls only go to numbers on your allowlist until you switch to production. A demo can never ring a stranger.
- **Recruiter dashboard**: ranked drag-and-drop Kanban, charts on every page, per-candidate verdict, pros and cons, score breakdown, transcript, work log, role filter, live call bar.
- **Scoring**: 100 points across experience, salary fit, notice period, location, must-have skills and answer quality. Knockouts force a Reject with the reason shown.
- **Extras**: AI job drafting, resume analysis, interview scheduling and scorecards, reference checks, offer drafts, onboarding, talent pool. Every AI feature has a rules-based fallback, so it works with no keys at all.
- **Built-in walkthrough**: the dashboard has a "How to use" tab that explains every page.

## Engineering

- **Next.js web app** in `web/`: a careers site, a full-screen voice interview room with a live transcript, candidate self-booking, and a recruiter dashboard with 13 pages. It has a design-token system with light and dark themes, and it works on mobile.
- **Layered backend** with no framework: `lib/` (infrastructure), `services/` (domain), `routes/` (HTTP), `db/` (versioned migrations). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Reliability**:
  - a circuit breaker, retries with backoff and timeouts on every voice-engine call;
  - idempotent, transactional webhook processing;
  - graceful shutdown;
  - health and readiness probes;
  - Prometheus metrics at `/metrics`.
- **AI quality**:
  - a tested contract between the agent prompt and the server;
  - a deterministic, explainable 100-point rubric;
  - an audit row for every automated score (rubric version and input hash);
  - offline evals gated in CI;
  - fairness tests that check personal attributes and names never move a score.
- **Security**: signed expiring sessions, rate limits, encrypted secrets, log redaction, CSP and a locked call allowlist. See [SECURITY.md](SECURITY.md).
- **CI**: syntax check, unit tests, end-to-end tests, evals and a Docker health probe on Node 22.13, 22.x and 24.x.

## How it fits together

```
 Naukri / Indeed CSV ──┐
 Careers page form ────┼──►  AI Recruiter OS  ──(call request)──►  Dograh  ──►  phone provider ──► candidate
                       │     (this repo)      ◄──(result webhook)──  (voice)
                       │      dashboard, scoring, queue, SQLite
```

Two programs: this app (dashboard, careers page, scoring, CSV import) and Dograh (the voice engine). Dograh needs a voice model key and a phone provider. Those are set inside Dograh, not in this repo.

## Quick start: one command

You need **Node.js 22.13 or newer** (free: <https://nodejs.org>).

```bash
git clone https://github.com/vivek-650/telephonic-ai-agent.git
cd telephonic-ai-agent
npm install
npm run dev        # hot reload; or: npm start (production build, built on first run)
```

Open <http://localhost:4870> for the careers site and <http://localhost:4870/dashboard> for the recruiter dashboard.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API and the web app with hot reload, and opens your browser |
| `npm start` | Checks your setup, builds the web app if needed, and starts in production mode |
| `npm run build` | Builds the web app (also type-checks every page) |
| `npm run demo` | Same as start, plus two demo roles with sample leads |
| `npm run doctor` | Tells you in plain words what is missing or broken |
| `npm test` | Runs the unit tests and the end-to-end tests against a mock voice engine |
| `npm run eval` | Runs the interview-pipeline evals: extraction, verdicts, fairness |
| `npm run coverage` | Unit tests with a coverage report |
| `npm run check` | Checks that every source file parses |

Everything works without any keys except real phone calls. **You never edit a `.env` file**: open the dashboard, click **Settings**, and follow the checklist.

## Connect the voice engine (Settings page)

The **Keys and secrets** tab (left menu) lists every key, where to get it and whether it is saved, with a Go to button for each, then walks you through it. Keys and passwords you save there are stored **encrypted** in the app's database and are never shown again (only the last 4 characters).

1. **Install Dograh**, the open-source voice engine that places the calls: <https://github.com/dograh-hq/dograh> (one Docker command). Create your account and an API key (Dograh dashboard, Settings, API keys).
2. In this app: **Settings > Voice engine**: paste the Dograh address and API key, press **Test the connection**.
3. **Create the AI agents**: one button on the checklist. It creates the screening agent and the rejection agent inside Dograh for you.
4. **Phone provider**: connect Twilio (Account SID, Auth Token, the number calls come from) on the Settings page.
5. **Voice model**: in Dograh, Settings > Models, choose a realtime voice model and paste its key there.
6. **Allow your own number** (Settings > Who can be called) and apply to a role with your phone: it rings.

`PUBLIC_BASE_URL` (Settings > Your brand) must be an address Dograh can reach, because Dograh posts each call's result back to this app. On one computer use a tunnel (Cloudflare Tunnel or ngrok) or run both on the same Docker network.

### Which Dograh version?

- **Tested:** Dograh 1.39.0 (voice-engine build) end to end, including real phone calls.
- **Standard upstream Dograh (1.49.0):** the endpoints this app needs were checked in the upstream source and exist with the same request shapes, but I have **not run** a call on it. Run `npm run doctor`, press Test the connection, and place one test call to your own phone first. Details: `docs/DOGRAH-COMPATIBILITY.md`.
- **Needs the voice-engine build of Dograh:** a different AI voice per role. Standard Dograh uses one voice for every agent, chosen in Dograh under Settings > Models. The app detects this by itself: on standard Dograh the voice dropdown explains why it is switched off, and nothing is silently ignored. The voice-engine build is public at <https://github.com/Harddiikk/voice-engine>.

## Use it

1. **Roles and jobs**: create a role (title, location, budget, must-have skills, extra questions). Open **Negotiation settings** on the role to set the budget, the stretch and the reason.
2. **Import leads**: pick the role, drop the CSV, click Import, then Start AI calls.
2b. Each role card has **Edit role details**, **Negotiation settings**, **AI voice and name** and **Copy apply link**.
3. **Pipeline**: candidates appear ranked by score. Drag cards between stages. Click a card for the full story.
4. **Calls**: every call with status, length and score.
5. **Rejected candidates**: open a card in the Rejected column. The panel shows the personal email draft: edit it if you like and click **Send rejection email**, or use **Send rejection emails to N rejected** above the board. The same panel has **Or call to deliver the decision**. The AI phones them (only numbers on your allowlist until you set production mode) and logs the outcome on the candidate's timeline.

The dashboard's **How to use** tab has the full click-by-click guide.

## Rebuild it for a client

See [docs/CLIENT-SETUP.md](docs/CLIENT-SETUP.md): branding, agent name and voice, role budgets, screening questions, deployment on a VPS or Docker, and the production checklist.

## Docker

```bash
cp .env.example .env
touch call-allowlist.txt
docker compose up --build
```

The database lives in `./data`. Note: the Docker setup is provided but was not run on the author's machine before release, so report any problem as an issue.

## Configuration

Every setting is in `.env.example` with a comment. The important ones:

| Setting | What it does |
|---|---|
| `ADMIN_PASSWORD` | Dashboard login. Empty means no login, for local use only. |
| `BRAND_NAME`, `AGENT_NAME` | Header text and the name the AI introduces itself with. |
| `DOGRAH_BASE_URL`, `DOGRAH_API_KEY`, `DOGRAH_AGENT_UUID` | Connection to your voice engine. |
| `PUBLIC_BASE_URL` | Where Dograh posts results. Must be reachable from Dograh. |
| `IMPORT_CALL_ALLOWLIST`, `IMPORT_CALL_ANY` | The calling safety lock. |
| `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `LLM_CUSTOM_URL` and others | Optional AI for job drafts and analysis. |

## What a call costs

Roughly **$0.40 to $0.75 per 4 to 5 minute call** with Twilio to India and a realtime voice model (about $0.27 phone, about $0.11 to $0.45 model, from listed prices at the time of writing). Your provider and country change this. Check your own billing consoles.

## Safety, consent and the law

You are responsible for who you call. Only call people who applied to you or agreed to a call, tell them the call is recorded (the agent says so), and follow the do-not-call and telemarketing rules where you operate (for example TRAI in India, TCPA in the US, GDPR for stored data). The AI drafts, scores and suggests. People decide: it never rejects, hires or sends an offer on its own. Keep `IMPORT_CALL_ANY=0` until you have a consent process.

## Testing

```bash
npm test
```

39 end-to-end tests (with a mock Dograh and a mock mail server) cover applying, scoring, webhooks, CSV import, the call lock and negotiation.

## Troubleshooting

- **Candidates stay "in progress" with no score**: Dograh cannot reach `PUBLIC_BASE_URL`, or the Dograh background worker is not running.
- **Caller hears "an application error has occurred"**: when Dograh runs behind a reverse proxy that strips a path prefix, start Dograh's API with `--proxy-headers` and `--root-path` set to that prefix so the phone provider's request signature validates.
- **"Calls only go out between 9 AM and 7 PM IST"**: tick "ignore calling hours" for a demo.
- **Everyone is skipped on import**: the number is not a valid Indian mobile, or it is not on the allowlist yet.

## Project layout

```
web/           Next.js app: careers site, interview room, booking, recruiter dashboard
  app/         routes: (public)/, apply/[jobId], book, login, dashboard/*
  components/  ui/ design system, charts/, interview/ (call room, simulator), candidate/, dashboard/
  lib/         typed API client, shared types, Dograh WebRTC session
server.js      composition root: hosts the web app, API, Dograh proxy and worker in one process
lib/           config, logging, router, validation, retries and circuit breaker, metrics, sessions, migrations
services/      interview lifecycle, scoring and audit, Dograh client, TURN relay
routes/        core API routes
db/            versioned schema migrations
suite.js       roles, CSV import and call queue, interviews, offers, automation, auth
scoring.js     100 point rubric, answer parsing, resume probes
llm.js         optional AI router with cache, daily cap and PII stripping
engine.js      engine room and traces
evals/         labelled interview cases and the eval runner
tests/unit/    unit tests (node:test); test.mjs is the end-to-end suite
dograh/        the screening agent (workflow.json, prompt) and optional agents
scripts/       setup-dograh.mjs, seed-demo.mjs
demo/          sample CSVs (placeholder numbers) and a sample resume
```

## License

MIT. Made by [AI with Shreyas Raj](https://www.youtube.com/@AIwithShreyasRaj).
