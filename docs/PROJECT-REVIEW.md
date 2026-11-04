# Recruit OS: project review

A complete description of what the system does, how each part is built, and where it is still weak.

Repository: <https://github.com/vivek-650/telephonic-ai-agent> (branch `main`)

---

## Contents

1. [Summary](#1-summary)
2. [The problem and the product](#2-the-problem-and-the-product)
3. [Technology stack](#3-technology-stack)
4. [Architecture](#4-architecture)
5. [Candidate journey, end to end](#5-candidate-journey-end-to-end)
6. [The voice agent (Dograh)](#6-the-voice-agent-dograh)
7. [AI and scoring logic](#7-ai-and-scoring-logic)
8. [Evaluation and fairness](#8-evaluation-and-fairness)
9. [Backend implementation](#9-backend-implementation)
10. [Data model](#10-data-model)
11. [API reference](#11-api-reference)
12. [Frontend (Next.js)](#12-frontend-nextjs)
13. [Security and privacy](#13-security-and-privacy)
14. [Testing](#14-testing)
15. [CI, build and deployment](#15-ci-build-and-deployment)
16. [Operations](#16-operations)
17. [Configuration reference](#17-configuration-reference)
18. [Engineering process](#18-engineering-process)
19. [Known limitations and next steps](#19-known-limitations-and-next-steps)
20. [Review checklist](#20-review-checklist)

---

## 1. Summary

Recruit OS is a self-hosted AI interview platform.

- **For the candidate:** they apply on a careers site, then an AI recruiter interviews them by voice, either in the browser (WebRTC) or by phone.
- **For the interview:** the AI asks resume-specific questions, can negotiate salary inside an approved budget, and hangs up on its own when the interview is over.
- **For the score:** the result is scored by a deterministic, explainable 100-point rubric. Every automated score is written to an audit table.
- **For the decision:** recruiters work in a dashboard that covers the whole funnel, from screening to onboarding. People make every hiring decision.

| | |
|---|---|
| Web app | Next.js 16, React 19, TypeScript, Tailwind CSS 4: about 3,300 lines in `web/` |
| API | Node.js 22, layered (infrastructure, services, routes), no runtime dependencies: about 3,400 lines plus the suite module |
| Database | SQLite through Node's built-in `node:sqlite`, WAL mode, 6 versioned migrations |
| Voice | Dograh (open-source, built on Pipecat), self-hosted in Docker. Browser interviews use WebRTC through a same-origin proxy and TURN relays. |
| AI | Rule-based scoring (deterministic, audited). An optional LLM router (Groq, Z.ai, Anthropic, xAI, any OpenAI-compatible endpoint) gives second opinions and drafts text, with a rules fallback. |
| Quality | 21 unit tests, 43 end-to-end tests against a mock voice engine, a 15-case labelled eval suite with CI gates, JSDoc type checks and a typed frontend |

---

## 2. The problem and the product

Recruiters in high-volume hiring (sales, support, operations, factory roles) spend most of their screening time on calls that end in "no": the salary is too high, the candidate can't relocate, the notice period is too long, or they have no relevant experience. The product automates that first conversation without automating the decision.

### Design principles

1. **The AI interviews, people decide.**
   - The scorer moves a candidate at most to Shortlisted, Review or Rejected.
   - It never moves anyone back once a human has moved them to Interview or Hired.
   - A share of auto-rejects is sampled for human review.
2. **Every score is explainable.** Each of the six rubric parts carries a written reason. Knockouts state why.
3. **Every score is reproducible.** The rubric version and a hash of the inputs are stored with every score.
4. **Personal attributes never affect the score.** This is enforced in code and tested.
5. **It works with no paid keys.** Every AI feature has a rules-based fallback.
6. **It can't ring strangers by accident.**
   - Calls only go to an allowlist until production mode is switched on.
   - Calls need recorded consent.
   - The same number can't be called again within 10 minutes.

### Feature list

**Candidate side**
- Careers home listing the open roles.
- A page per role with an apply form.
- Resume upload: the PDF is converted to text on the server, or the candidate pastes the text.
- Explicit consent, recorded with a timestamp.
- A "get ready" screen before the interview (headphones, a quiet room, microphone permission).
- Browser voice interview in a full-screen call room with a live transcript, mic level meter, mute, end, timer and a recording badge.
- Phone interview fallback ("Call me now").
- Typed interview fallback when no voice engine is connected.
- Self-booking of the human interview: available slots, IST times, a confirmation with the meeting link.

**Recruiter side (13 pages)**
- **Overview:**
  - 5 headline numbers: applicants, AI interviews, strong matches, recruiter time saved, how often recruiters agree with the AI;
  - the hiring funnel with conversion rates;
  - where applicants come from;
  - the score distribution;
  - a per-role comparison;
  - the top candidates and the latest interviews;
  - an alert when candidates are waiting on a human decision.
- **Pipeline:**
  - a 7-stage board, ranked by AI score within each stage;
  - drag and drop between stages, applied immediately and rolled back if the save fails;
  - search and a role filter;
  - the blocking reason shown on each card.
- **Candidates:** a sortable, filterable table, plus CSV export.
- **Candidate page:**
  - header with score, verdict, stage control, shortlist, reject and erase data;
  - **Overview tab:** verdict, blocker, strengths and concerns, comparison with the applicant pool, flags, evidence quotes, score breakdown, LLM analysis;
  - **AI interview tab:** transcript as a chat, the answers the AI pulled out, a "phone screen now" button, an interview kit;
  - **Hiring tab:** human interviews and scorecards, offers, onboarding checklist, references, messages;
  - **Activity tab:** timeline, notes and the decision audit trail;
  - **Sidebar:** "Was the AI right?" feedback, a combined hire signal, application details, resume.
- **Interviews log:** every AI interview with mode, status, failure reason, length, turns and score.
- **Roles:**
  - role cards with an apply link and a talent-pool match;
  - a role editor: requirements, accepted cities, must-have skills, extra questions;
  - salary negotiation settings (stretch percentage and the reason the budget is tight);
  - the AI's name and voice per role;
  - an AI-drafted job description.
- **Import leads:**
  - drag-and-drop CSV import, with columns matched by name and duplicates skipped;
  - a per-row problem report;
  - imported batches, starting AI calls with a count and the gap between calls;
  - the live call queue with a stop button.
- **Schedule:** upcoming interviews grouped by day, and past ones.
- **Offers:** every offer with its status and the acceptance rate.
- **Team:** per-recruiter activity, how often each agrees with the AI, average interview rating, high or low output flags.
- **Automation:**
  - switches for the rules: auto-call, auto-analyse, auto-draft messages;
  - the fairness spot-check rate;
  - working hours and slot length;
  - LLM provider status and daily usage;
  - the background queue, with "run now" and "retry".
- **Engine room:**
  - the voice-engine wiring (keys masked);
  - a live trace of everything sent to and received from Dograh;
  - an interview preview: paste a resume, see the summary, the questions the AI will probe, the variables it receives and the rendered prompt;
  - the agent prompts and the event feed.
- **Settings:**
  - keys and options grouped by area, encrypted at rest and masked;
  - "test connection" for Dograh and for the mailbox;
  - one click to create the AI agents in Dograh;
  - the safety-lock status;
  - the scoring rubric with the fixed interview questions.
- **Across the dashboard:**
  - a pipeline assistant that answers questions from live pipeline data, using the LLM or rules;
  - an "acting as" recruiter picker that attributes actions to a recruiter;
  - light and dark themes;
  - layouts that work on mobile.

**Communication**
- **Rejection email:** a personal, editable draft (the main reason, one real strength, an offer to keep their details) sent over SMTP. It has an allowlist lock, a duplicate guard and a bulk send capped at 25 per click.
- **Rejection call:** the AI phones a rejected candidate to share the decision. A human always triggers it and confirms it.
- **AI-drafted messages** for shortlisting, interview confirmation, reminders, no-shows, offers, documents, joining and follow-ups. They are sent through a WhatsApp deep link, and nothing is sent automatically.
- **Reference checks:** the AI phones a referee, or the recruiter enters the answers by hand.

---

## 3. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Web framework | Next.js 16 (App Router, Turbopack), React 19 | File-based routing, layouts, a production build that type-checks every page |
| Styling | Tailwind CSS 4 with CSS-variable design tokens | One token set gives light and dark themes and consistent colours |
| UI building blocks | Own components (`web/components/ui`), native `<dialog>`, lucide icons, sonner notifications | No heavy component library. The native dialog gives focus trapping and Escape for free |
| Data fetching | SWR, through a typed `api()` client | Caching, polling for live views, revalidation on focus |
| Charts | Recharts behind thin wrappers | Every chart uses the design tokens |
| Fonts | Geist Sans and Geist Mono (bundled locally) | No external font request when the page loads |
| API | Node.js 22 `http`, own router, validation and error handling | No framework lock-in; every layer is small and tested |
| Database | `node:sqlite` (`DatabaseSync`) | No database server to run; enough for a single-tenant deployment |
| Voice engine | Dograh 1.50 in Docker (FastAPI, Pipecat, Postgres, Redis, MinIO, coturn) | Open source and self-hosted; real-time voice; supports telephony providers |
| Voice model | Configured inside Dograh (currently Gemini Live). It can be swapped for Deepgram for speech-to-text, Groq as the LLM and Sarvam for text-to-speech. | The provider is a Dograh setting, not code |
| Tunnel | Cloudflare quick tunnel (`cloudflared` in Docker) | Lets colleagues anywhere use the local deployment |
| TURN | Dograh's coturn (LAN), plus Cloudflare TURN or Twilio Network Traversal (internet) | Browser interviews from any network |
| Email | Own SMTP client (`mailer.js`: `net` and `tls`, SSL and STARTTLS) | Works with any mailbox, no SDK |
| PDF | `pdftotext` (poppler), run asynchronously | Fast, accurate text extraction from resumes |

---

## 4. Architecture

### 4.1 System view

```
 Candidate browser ──HTTPS──►┐
   careers, apply, booking   │     ┌──────────────── Recruit OS (one Node.js process) ────────────────┐
   interview room ──WebRTC───┼──┐  │ server.js  composition root                                     │
                             │  │  │   ├─ Next.js app (web/)     pages: careers, interview, dashboard │
 Recruiter browser ──HTTPS──►┤  │  │   ├─ API pipeline            lib/ + services/ + routes/ + suite  │
   dashboard (cookie login)  │  │  │   ├─ /dograh/* proxy         public embed HTTP + signaling WS    │
                             │  │  │   └─ worker (10 s tick)      tasks: analyse, call, remind, draft │
 Cloudflare tunnel ─────────►┘  │  │            │                                                    │
                                │  │            ▼                                                    │
                                │  │     SQLite (WAL)  recruiting.db                                 │
                                │  └──────────┬───────────────────────────────▲────────────────────────┘
                                │             │ create call, fetch run         │ end-of-call webhook
                                │             ▼                                │
                                └──TURN──► Dograh (Docker): FastAPI, Pipecat, coturn ──► voice model
                                                                │
                                                                └──► telephony (Twilio, Vobiz, …) ──► candidate phone
```

### 4.2 Why one process hosts both the pages and the API

Next.js runs as a custom server inside `server.js`, not as Route Handlers. Three requirements need a long-lived process:

1. **WebSocket proxy.** The browser interview's signaling WebSocket goes `browser → /dograh/... → Dograh`, so a candidate only ever talks to one origin (the tunnel). Route Handlers can't upgrade connections.
2. **Background worker.** The task queue runs analyses, call queues, reminders and onboarding chasers every 10 seconds.
3. **Single-writer SQLite.** One process owns the database file.

Every non-API path goes to Next.js. The API keeps its own router, validation, error model and metrics. `RECRUIT_UI=off` runs the API alone, which the end-to-end tests use.

### 4.3 Code layout

```
web/                          Next.js app
  app/(public)/               careers home, apply/[jobId], book
  app/dashboard/              13 dashboard pages + layout (shell, auth redirect)
  app/login/                  sign-in
  components/ui/              button, card, badge, avatar, score ring, meter, tabs, stat, form controls, dialog, sheet
  components/charts/          funnel, histogram, grouped bars, donut
  components/interview/       call room, interview stage (ready, live, done, failed), typed simulator
  components/candidate/       overview, interview, hiring, activity sections
  components/dashboard/       shell (sidebar, header, theme, recruiter picker), assistant, role filter
  lib/api.ts                  typed fetch client, 401 → login event, SWR hook
  lib/types.ts                every API response shape
  lib/dograh-session.ts       WebRTC + signaling client for browser interviews
  lib/recruiter.ts            "acting as" recruiter (local, synced across components)
  lib/utils.ts                formatting (IST dates, rupees, LPA), stage and verdict tones
server.js                     composition root, request pipeline, Next.js hosting, Dograh proxy, lifecycle
lib/                          infrastructure (see 9.1)
services/                     domain: screening contract, interviews, candidates, Dograh client, relay
routes/core.js                core API routes
db/migrations.js              versioned schema
suite.js                      roles, CSV import, call queue, interviews, offers, onboarding, messages, auth, settings API, automation
scoring.js                    questions, answer parsing, rubric, evaluation, resume probes
llm.js                        multi-provider LLM router
mailer.js                     SMTP client
settings.js                   encrypted settings store and field definitions
engine.js                     engine room endpoints and the in-memory trace
dograh/                       agent workflows and prompts (screener, rejection, reference, reminder)
evals/                        labelled cases and the eval runner
tests/unit/                   node:test unit tests
test.mjs                      end-to-end suite (mock Dograh, mock SMTP)
scripts/                      doctor, setup-dograh, seed-demo, check
```

Dependencies point one way: routes, then services, then lib. Each service is a factory that receives its collaborators (`createInterviewService({ db, candidates, dograh, callAllowed, hooks, trace, log })`), so any of them can be swapped out in tests.

---

## 5. Candidate journey, end to end

### 5.1 Apply

1. **The candidate opens `/apply/<roleId>`.** Old links of the form `/?role=<id>` redirect there.
2. **The form posts to `POST /api/applications`.** Validation is a schema (`ApplicationSchema` in `routes/core.js`):
   - name, email, phone and city are required;
   - email and phone formats are checked;
   - numbers have ranges: experience 0 to 60 years, notice 0 to 365 days, salary 0 to ₹10 crore;
   - text length is capped;
   - consent counts only if it is explicitly true.

   Errors come back as an `errors[]` array, and the page maps them onto the right fields.
3. **The PDF resume is uploaded raw to `POST /api/resume/pdf`.** The server:
   - caps it at 5 MB and checks the `%PDF-` magic bytes;
   - writes it to a temporary file and runs `pdftotext -layout` asynchronously (15-second timeout);
   - tidies the text and rejects scanned PDFs with no text (422);
   - deletes the temporary file in a `finally` block.
4. **One transaction** inserts the candidate (phone normalised to E.164, +91 for 10-digit numbers), writes the "applied" event and runs the first score ("Pending screen", from the form only). The score's audit row is written in the same transaction.
5. **The `afterApply` hook** queues resume parsing and, if auto-call is on and the number is allowed, a phone screen one minute later.
6. **The response** includes the full `screeningContext`: every variable the interviewer prompt uses.

### 5.2 Interview: browser (the default)

1. **"Get ready" screen.** An explicit Start button gives the browser the user gesture it needs before it will play audio.
2. **`POST /api/candidates/:id/screenings {mode:'web'}`** creates an in-progress screening and moves the candidate to the Screening stage.
3. **`POST /api/public/ice`** returns internet TURN credentials (Cloudflare TURN first, Twilio second). It only does so for a candidate whose browser interview started in the last 30 minutes, so strangers can't use up the relay.
4. **`DograhSession` (`web/lib/dograh-session.ts`)** runs the connection:
   - `POST /dograh/api/v1/public/embed/init` with the embed token and the interview variables, which returns a session token;
   - `getUserMedia` with echo cancellation, noise suppression and automatic gain;
   - fetches Dograh's own TURN credentials (the LAN coturn), adds the internet relays and creates the `RTCPeerConnection`;
   - opens the signaling WebSocket at `/dograh/api/v1/ws/public/signaling/<token>`;
   - creates the offer and waits up to 3 seconds for ICE gathering, so the relay candidate goes out with the offer; later candidates are sent as they arrive;
   - handles every message type: `answer`, `ice-candidate`, the live-transcript events (`rtf-bot-text`, `rtf-user-transcription`, started and stopped speaking), `call-ended` and `error`;
   - **reports exactly one outcome per session**, either `end` (the interview happened) or `error` (it never connected);
   - treats a short `disconnected` blip as recoverable, with a 6-second grace period;
   - can be disposed mid-setup safely: every `await` checks whether the session was disposed, which also covers React's double-run of effects in development mode.
5. **The call room (`components/interview/call-room.tsx`)** shows the call:
   - the agent's avatar with rings while it speaks;
   - status (Connecting, Listening, the agent speaking, Muted);
   - a timer, a recording badge and a mic level meter (Web Audio `AnalyserNode`);
   - a live transcript: agent speech arrives in pieces and is joined with punctuation-aware spacing; the candidate's partial captions are shown dimmed until final; the view auto-scrolls only while you're near the bottom;
   - mute, and end with a confirmation;
   - a warning before closing the tab mid-interview, and a page-scroll lock while the call is open.
6. **The agent hangs up itself** when the interview is done (an `endCall` node; see 6.2). The page shows "Interview complete" with how long it lasted.
7. **Errors are mapped to plain language.** For example, a microphone permission denial explains how to allow it. The candidate can retry; the application is kept.

### 5.3 Interview: phone

`mode:'phone'` checks, in order:
- Dograh is configured, or the request returns 409;
- consent was recorded, or 403;
- the number is on the allowlist (`call-allowlist.txt` or `IMPORT_CALL_ALLOWLIST`, unless `IMPORT_CALL_ANY=1`), or 409;
- no phone call to this candidate started in the last 10 minutes, or 429.

Then it picks the role's agent (see 6.3) and places the call through Dograh's public agent API. The call trigger is **never retried**, because a retry after a timeout could ring the candidate twice.

### 5.4 Interview: typed (simulator)

When no voice engine is set up, the same 6 questions are asked as a chat, with the relocation and experience questions personalised from the form. `POST /api/screenings/:id/complete` parses the answers with the same parser and scores them. This endpoint **refuses any screening that isn't in simulator mode** (403), so the public endpoint can't overwrite a real voice interview with typed answers.

### 5.5 Result: the webhook

`POST /api/webhooks/dograh` (`services/interviews.js` `handleWebhook`) processes the result in this order:

1. **Optional shared secret.** If `WEBHOOK_SECRET` is set, the request must carry it as `X-Webhook-Secret`. The comparison is constant-time (SHA-256 then `timingSafeEqual`).
2. **Normalise the payload.**
   - Dograh's template engine sometimes turns the context objects into strings; those are parsed back.
   - If a string contains raw newlines from resume text, it is retried with control characters escaped.
3. **Route by kind.** Reference and rejection calls go to their own handlers.
4. **Find the screening:** by run id, then by the candidate id in the context, then the latest in-progress browser interview. If none exists, one is created.
5. **Ignore exact repeats.** The delivery key is `candidate id : SHA-256 of the payload`. If that key was already processed (`webhook_deliveries`), the request is answered as before without scoring or notifying again.
6. **Don't trust the posted transcript.** The run is re-read from Dograh (`GET /workflow/:wid/runs/:run`) to get the real transcript and the real call length.
7. **Parse** the answers (`answersFromDograh`) and the transcript, and collect everything the candidate said as the evidence text.
8. **Incomplete check.** If the candidate never spoke, or the call lasted under 15 seconds, the screening is marked incomplete with a `failure_reason` (`candidate_silent` or `too_short`) and isn't scored.
9. **One transaction** writes the screening, the delivery key, the events, the new score, its audit row and the stage change.
10. **Afterwards:** metrics, a structured log line, and `afterScreen`. That queues the LLM analysis, may sample a reject for a fairness spot check (it then goes to Review), or queues shortlist or rejection message drafts.

### 5.6 After the AI interview

- **Human interviews**, booked by the recruiter or by the candidate (`/book?c=<id>`). Free slots come from working hours, slot length, weekdays only, at least 2 hours' notice and the number of recruiters.
- **A reminder 24 hours before** (configurable): a message draft plus an optional AI reminder call.
- **No-shows:** the candidate goes back to Shortlisted, and an AI call 30 minutes later offers to rebook.
- **Scorecards**: 5 dimensions rated 1 to 5 (role skills, communication, problem solving, motivation, culture add) and a recommendation from strong yes to strong no. A "strong no" vetoes the hire signal.
- **Hire signal:** 40% the AI score, 40% the average interview rating (scaled to 100) and 20% the reference rating. When a part has no data yet, the weights are rebalanced over the parts that do. It falls into one of these bands:

  | Hire signal | Band |
  |---|---|
  | 80 or more | Strong hire signal |
  | 65 to 79 | Lean hire |
  | 50 to 64 | Borderline |
  | under 50 | Lean no |
  | any, with a "strong no" scorecard | Interviewer veto |
- **Offers:**
  - the letter is drafted by the LLM;
  - it is accepted only if it keeps the name placeholder and the exact salary, otherwise a template is used;
  - it warns when the salary is over budget;
  - allowed status changes: draft → sent → negotiating, accepted or declined.
- **When an offer is accepted:** the candidate moves to Hired, an 11-item onboarding checklist is created with due dates relative to joining (documents, laptop, day 1, 7 and 30 check-ins), and a joining reminder is queued.
- **When an offer is declined:** the candidate moves to Rejected.
- **References:** added by the recruiter, called by the AI's reference agent, and the answers are stored (would rehire, rating, strengths, concerns, whether the dates match).
- **Talent pool:** past applicants who would score 50 or more for another role with no knockout can be added to it with one click, but only if they consented to be contacted about other roles.

---

## 6. The voice agent (Dograh)

### 6.1 Workflow (`dograh/workflow.json`)

The workflow has four nodes:
- `startCall`: the screener prompt, plus the extraction of the answer variables;
- `endCall`: a closing line, then hang up;
- `webhook`: posts the result to `PUBLIC_BASE_URL/api/webhooks/dograh`;
- `trigger`.

The edge `start → end` is labelled "End call", which Dograh exposes to the LLM as the `end_call` function. `dograh/rejection-workflow.json` has the same structure for rejection calls. `scripts/setup-dograh.mjs`, or the Settings button, creates both agents through Dograh's API and saves their ids.

### 6.2 The prompt and the variables it relies on

`dograh/screener-prompt.txt` (kept identical to the prompt inside `workflow.json`, which a unit test enforces) defines the interview:

- **Stage 1** greets the candidate by first name and confirms the application. **Stage 2** checks it's a good time to talk. In browser mode both are skipped, and the agent never says "calling".
- **Stage 3** confirms the details from the form.
- **Stage 4** covers the core questions: relevant experience, a specific example with results, notice period, expected salary, whether they can work from the job location, and interview availability.
- **Resume probes:** it asks about gaps in the timeline and checks skills the candidate claims.
- **The role's own extra questions.**
- **Salary negotiation** (only when switched on for the role):
  - the agent states the budget in lakhs per year;
  - it makes one counter-offer, capped at the stretch;
  - it gives the reason the budget is tight;
  - it never promises an offer;
  - it records the outcome (`negotiation_outcome`, `agreed_salary`).
- **Turn rules:** one question at a time, short sentences, and calling `end_call` after the closing line.

**The contract:** `services/screening.js` `screeningContext()` builds every variable the prompt can use:
- candidate: id, name, first name, city, plus the experience, notice, salary and skills from the form;
- role: title, company, location, minimum years, must-have skills, extra questions;
- resume: whether there is one, a summary, the text (capped at 6,000 characters) and the probes;
- the date applied;
- negotiation: on or off, budget and stretch both monthly and in LPA, and the notes;
- the agent's name and the interview mode.

`tests/unit/interview-contract.test.mjs` fails the build if the prompt uses a variable the server never sends.

### 6.3 Per-role agents and voices

If a role has a voice and the Dograh build supports per-agent voices (detected by probing the realtime voice catalogue endpoint, and cached), `services/dograh.js` `roleAgent()` makes the role its own agent:

- it clones the default agent's workflow with that voice;
- it detects changes with a content hash of the workflow plus the voice, so a role's agent is rebuilt only when the default agent or the voice changes;
- it stores the agent ids on the job.

On standard Dograh, the voice dropdown is switched off and the page explains why. Nothing is silently faked. **If building a role's agent fails, the default agent is used**, so a call is never blocked.

### 6.4 Networking for browser interviews

- **The `/dograh/*` proxy** passes exactly three public endpoints (`embed/init`, `embed/config/:token`, `embed/turn-credentials/:token`) and the signaling WebSocket. Every other Dograh path returns 404 before it reaches Dograh.
  - The proxy never adds the API key.
  - It rewrites the Origin header so Dograh's allowed-domain check passes.
  - It times out after 15 seconds.
- **TURN:**
  - Dograh's coturn relay works on the LAN;
  - candidates on other networks (colleagues in other cities) need an internet relay, which comes from Cloudflare TURN (free tier) or Twilio Network Traversal (`services/relay.js`);
  - credentials last 4 hours and are reused for 1 hour, with a retry and a fallback between the two providers;
  - only TURN addresses are kept from what they return.

### 6.5 Capacity and cost (measured and calculated)

- **Concurrency:** 3 to 5 interviews at once on the current laptop (4 CPUs, one Dograh API worker). Dograh's own limit is 10. The limit comes from the voice engine, not this server.
- **Cost per 10-minute interview:**

  | Option | Cost |
  |---|---|
  | Gemini Live (current) | about $0.94 (range $0.65 to 1.25), because every turn re-sends the audio context |
  | Deepgram + Groq + Sarvam pipeline (browser) | about ₹11 to 20 |
  | Same pipeline by phone, with Vobiz telephony | about ₹20 to 30 |

  Dograh supports all three providers natively; switching is a setting in Dograh.

---

## 7. AI and scoring logic

### 7.1 Answer parsing (`scoring.js` `parseAnswer`)

| Type | Examples handled |
|---|---|
| Years | "about three years" → 3, "18 months" → 1.5, number words, "2.5 yrs" |
| Notice period | "one month" → 30, "2 weeks" → 14, "immediately" → 0, "45 days" → 45, "three months" → 90 |
| Salary (monthly rupees) | "55k" → 55,000; "6 LPA" → 50,000; "1.2 lakh per month" → 120,000; "10 lakhs" → 83,333 (bare lakhs = per year); "90" → 750,000 (a bare number up to 300 = LPA); "around 48,000 per month" → 48,000 |
| Yes or no | "Yes, I already live there" → true; "No, I can't move" → false |
| Negotiation | Free text → `accepted`, `declined`, `not_needed` or `not_discussed` (`normaliseNegotiation`) |

### 7.2 The 100-point rubric (`scoreCandidate`, version `2026.11-3`)

| Part | Points | Rule |
|---|---|---|
| Experience | 20 | Relevant years against the role minimum; full marks at 1.2× the minimum. Knockout if more than 2 years under. |
| Salary fit | 15 | At or under the ceiling: full. Up to 15% over: 60%. Up to 30% over: 25%. **Knockout above 30% over.** A salary negotiated inside the role's approved stretch counts as on budget. |
| Notice period | 10 | Within the maximum: full. Up to 2×: about half. Longer: 0, and flagged. |
| Location | 10 | Lives in an accepted city, or confirms they can work there: full. Not confirmed: 40%. **Refuses: 0 and a knockout.** |
| Must-have skills | 15 | Share of the must-have skills mentioned across the form, the "why" answer and the interview. Whole-word matching with light stemming. |
| Answer quality | 30 | Specific evidence (see 7.3). The form-versus-interview experience mismatch penalty also applies here. |

- **Verdicts:**

  | Condition | Verdict |
  |---|---|
  | Not interviewed yet | Pending screen |
  | Any knockout | Reject |
  | 75 or more | Strong |
  | 55 to 74 | Maybe |
  | Under 55 | Reject |
- **Flags:**
  - red: the knockouts;
  - amber:
    - a long notice period;
    - the form and the interview disagree on years by 2 or more (−6 points);
    - a vague example;
    - no example at all;
    - a negotiated salary;
    - a negotiation that was declined;
  - green: specific, number-backed answers.

### 7.3 Answer quality (`evidenceOf`)

1. **Clean the text.** Years like 2019 are replaced with a placeholder so dates don't count as results, and duplicate sentences are removed.
2. **Drop personal sentences.** Any sentence about age, marital status, children, religion, caste, health or disability, gender or nationality is removed first. It can never earn or cost points.
3. **Ignore logistics.** Sentences about notice, salary or availability are skipped unless they also describe an impact.
4. **Count the evidence:**
   - results backed by numbers: money, percentages, time saved, growth;
   - other sentences that contain numbers;
   - scale (counts of users, clients, calls, team size);
   - distinct ownership verbs ("I built", "we launched", "I led");
   - a length bonus.
5. **Score it:** 5 points per result (up to 3), 2 per other number (up to 2), 2.5 per scale mention (up to 2), 1 per ownership verb (up to 3), plus up to 3 for length. The total is capped at 30.
6. **Keep the proof.** Up to 4 quoted sentences are stored as evidence and shown on the candidate page.

### 7.4 Must-have skill matching (`mentionsSkill`)

Matching is on whole words, after light stemming of both the skill and the text (it removes -ing, -ed, -es and -s). So:
- "java" does **not** match "JavaScript";
- "cold calls" matches "cold calling";
- "SLAs" matches "sla";
- "C++" and "Node.js" work, because + and # count as part of a word.

This replaced a substring match that gave false positives; the eval suite found the bug.

### 7.5 Evaluation (`evaluate`)

- **Strengths and concerns:** rubric parts at 80% or more, and at 40% or less.
- **Comparison with the pool:** with 3 or more other applicants for the same role, the candidate's experience, salary ask and score are compared with the pool's median. A difference of 1.5× or more, or 0.6× or less, is shown as a good or bad outlier.
- **Blocker:** a one-line reason why the candidate can't be hired as things stand. It's either the red flags, or for a reject on score, "under the 55 bar, weakest area: …".

### 7.6 Resume probes (`resumeProbes`)

Built with rules, no LLM:
- **Timeline:** reads ranges like "2019-2021", "2021 - Present", "2021 to 2022" and "Jan 2021 - Mar 2022".
- **Gaps:** 6 months or more when months are known on both sides, otherwise a whole year.
- **Not gaps:** a job change.
- **Claimed skills** are matched against a skill list.
- **Highlights:** lines with a number that isn't part of a date. Contact lines are skipped (email, URLs, LinkedIn, GitHub, 8 or more digits).

The output is a summary and specific questions for the AI to ask, for example "You show work until 2021 and then nothing until 2023…" and "You claim Node.js…".

### 7.7 The LLM router (`llm.js`)

- **Provider order:** Groq, Z.ai, Pollinations (only if explicitly enabled), a custom OpenAI-compatible endpoint, xAI, then Anthropic. The order is configurable with `LLM_CHAIN`.
- **Guards:**
  - a response cache keyed by a hash of the prompt;
  - a daily call cap (400 by default);
  - a cooldown on a provider after it fails;
  - a 30-second timeout;
  - `<think>` blocks are stripped.
- **Privacy:** emails and phone numbers are removed from every prompt before it leaves the machine.
- **Logging:** every call goes to `llm_usage` (provider, model, success, cached or not, duration, characters in and out, error), which feeds the Automation page.
- **Tasks:**
  - job drafting;
  - resume parsing (summary, skills, current company);
  - candidate analysis (summary, strengths, concerns, red flags, a suggested next step, confidence);
  - the interview kit;
  - message drafts;
  - offer letters;
  - the pipeline assistant.
- **Fallback:** every task falls back to rules or templates when no provider is available.
- **The bias guard** is in every prompt that judges a person: "Judge only job-related evidence. Never use or infer age, gender, religion, caste, marital status, family plans, health, disability, nationality, accent or name."

---

## 8. Evaluation and fairness

### 8.1 Offline evals (`evals/`, `npm run eval`)

`evals/cases.json` holds 15 labelled interviews across two roles. Each case has a job, the form answers and the spoken answers, and the expected parsed values, verdict and flags. Some cases carry a note explaining the label; others name a twin case they must score identically to.

| Metric | Gate | Current |
|---|---|---|
| Reading the spoken answers correctly (field accuracy) | 95% | **100%** |
| Verdict accuracy (with a confusion matrix) | 90% | **100%** |
| Expected flags raised | (reported only) | **100%** |
| Fairness | 100% | **100%** |

Fairness means swapping the name across 6 names from different regions and religions never changes the score, and the paired cases (the same answer with and without personal details) score identically.

CI fails below a gate. `--json` prints a machine-readable report, and CI uploads it.

**What the eval suite found:**
- "java" matched "javascript";
- "cold calls" didn't match "cold calling";
- the "I'm 34, married, two kids" sentence raised the score (now removed before scoring);
- a salary negotiated inside the stretch was still marked down.

Four labels were also corrected after review, where the rubric's answer (Maybe) was the right one; each has a note in the file.

### 8.2 Fairness controls in production

- Personal-attribute sentences are removed from scoring (7.3).
- The bias guard is in every LLM prompt (7.7).
- **Spot checks:** a configurable share of auto-rejects goes to Review for a person.
- **"Was the AI right?"** feedback on every candidate, which drives the agreement rate on the dashboard and per recruiter.
- **Audit trail:** every automated score is in `score_audit` with the rubric version, a hash of its inputs, what triggered it and the full breakdown. It's shown on the candidate page.
- **The scorer never overrides a human.** It moves candidates only between Applied, Screening, Review, Shortlisted and Rejected.

---

## 9. Backend implementation

### 9.1 Infrastructure (`lib/`)

| Module | What it does |
|---|---|
| `config.js` | Loads `.env` (the real environment wins); typed getters (`envStr`, `envNum`, `envBool`). `DOGRAH` getters read live values, so Settings changes apply without a restart. `validateConfig()` checks settings at startup: a bad port or URL stops the boot; a short password, a missing session secret or webhook secret, or production calling switched on is logged as a warning. |
| `logger.js` | Structured logger: JSON lines (`LOG_FORMAT=json`) or readable lines, with levels, child loggers (every request's `request_id` is on its log lines) and **redaction**: secret-looking keys are masked, and emails and phone numbers in text are scrubbed. |
| `http.js` | `HttpError` (plus `badRequest`, `notFound`, `conflict`); `send()` with security headers and `no-store`; `readJson()` (1 MB cap, 413 when too large, 400 for bad JSON); `readRaw()` for uploads; `Router` with `:param` patterns; `reply(status, body)`, which a symbol marks so it can't be confused with data that happens to have a `status` field; `clientIp()`. |
| `validate.js` | A small schema validator: `str`, `email`, `phone`, `num`, `bool`, `oneOf`, `object().parse()`. It converts values to the right type and collects every error, not just the first. |
| `resilience.js` | `retry()` with exponential backoff and full jitter, only for transient errors (network, timeout, 408, 429, 5xx). `CircuitBreaker` (closed → open → half-open), which only counts transient failures, so a 400 never trips it. |
| `metrics.js` | Counters and histograms in Prometheus format: HTTP requests by method, route and status; latency; screenings by mode and outcome; Dograh requests by outcome; webhooks by outcome. Plus gauges for candidates, live screenings, pending and failed tasks, and memory. |
| `rate-limit.js` | Token-bucket limiter per client, which forgets the least recently seen clients beyond 10,000. |
| `session.js` | Signed, expiring session tokens (`v2.<expires>.<nonce>.<hmac>`). The signing key mixes `SESSION_SECRET` with a fingerprint of the password, so changing the password logs everyone out. Compared in constant time. |
| `db.js` | `openDatabase()` (WAL, `synchronous=NORMAL`, `busy_timeout=5000`), `runMigrations()` (each migration once, in order, in its own transaction, with a check that versions only go up), `transaction()` (nested calls join the outer one), `json()` (a safe JSON column parse). |

### 9.2 Request pipeline (`server.js`)

1. **Request id:** taken from the `X-Request-Id` header or generated; returned on the response and added to every log line.
2. **Tunnel guard:** a request that arrived through Cloudflare (it carries a `cf-connecting-ip` header) may only reach the webhook and health endpoints until a dashboard password is set.
3. **Dograh proxy** (`/dograh/*`).
4. **Operational endpoints:** `/api/health` (liveness), `/api/ready` (readiness: database, Dograh, breaker state; 503 if the database fails) and `/metrics` (only from this machine, or with `METRICS_TOKEN`).
5. **Suite routes**, which include the login gate for every non-public `/api/*` path and the rate limits on the public forms.
6. **Engine room routes.**
7. **Core router.**
8. **Next.js**, for every non-API path. Security headers are set first, because Next.js starts sending the response itself.
9. **Error mapping:** `HttpError` returns its own status and message; malformed JSON returns 400. Unexpected errors return 500; in production the message is generic and the details go to the log.
10. **Metrics and a debug log line** are recorded when the response finishes, even if it finished synchronously.

The server times out requests after 60 seconds and headers after 20.

### 9.3 Services (`services/`)

| Service | What it does |
|---|---|
| `screening.js` | Pure functions: `screeningContext`, `negotiationContext`, `parseWebhook`, `answersFromDograh`, `normaliseNegotiation`, `transcriptFromDograh`, `transcriptFromRun`, `isIncomplete`. |
| `interviews.js` | `start` (the three modes and the phone safety checks), `completeSimulator`, `handleWebhook` (see 5.5), `liveWebInterview` (the gate for relay credentials). |
| `candidates.js` | Prepared statements; `jobRow`, `full` (the candidate page payload, including the last 20 audit rows), `evaluationFor`, and `rescore`: one transaction that upserts the score, writes the audit row and changes the stage only between automatic stages. |
| `dograh.js` | The `DograhError` type; `api()` through the circuit breaker (5 failures open it for 30 seconds); reads retried 3 times, writes not retried; `createAgents` and `publish` (draft, save, publish, fetch the uuid); a capability probe with a cache; `roleAgent` and `syncRoleAgents`; `call` (never retried); `fetchRun`. |
| `relay.js` | TURN credentials from Cloudflare or Twilio, with an 8-second timeout, a retry, a fallback between the two and a 1-hour cache. It never throws. |

### 9.4 The suite (`suite.js`)

- Roles: create, update, validation, AI drafting, voices, talent-pool matches.
- CSV import:
  - the parser handles quoted fields, escaped quotes, newlines inside quotes and a byte-order mark, and detects comma, tab or semicolon separators;
  - header names are matched to fields (Naukri, Indeed and generic exports);
  - duplicates are detected by email or phone within the role;
  - a resume is built from each row's columns.
- The call queue (see 9.6).
- Interviews and slots, scorecards, the hire signal.
- References, offers and onboarding.
- Message templates and drafts.
- Rejection email and call.
- Analytics.
- The pipeline assistant.
- The settings API.
- Authentication.
- The automation worker.

### 9.5 Background worker

A database task queue (`tasks` table) is checked every 10 seconds, 5 tasks at a time, with a re-entry guard. Up to 3 attempts per task, 2 minutes apart, then the task is marked failed; it can be retried from the UI.

Task types:
- `resume_parse`
- `analyze`
- `screen_call`
- `draft_message`
- `interview_reminder`
- `no_show_rescue`
- `doc_chase`
- `joining_reminder`

Tasks that place calls wait for the calling window, 9 AM to 9 PM IST.

### 9.6 Call queue for imported leads

`POST /api/import/call`:
- needs an explicit confirmation;
- only runs between 9 AM and 7 PM IST, unless forced for a demo;
- takes a count (1 to 200) and a gap between calls (30 to 900 seconds);
- only queues valid Indian mobile numbers that are on the allowlist and haven't been called yet;
- reports how many were skipped because the number isn't dialable or the lock blocked it.

The queue runs one call at a time, through the same screening endpoint (so the same safety checks apply), and keeps a log of recent results. It can be cancelled.

### 9.7 Authentication

- **Optional:** set with `ADMIN_PASSWORD`. Without it the dashboard is open, which is only for local use.
- **Login:** limited to 5 attempts per minute per client, with `Retry-After`. The password is compared in constant time.
- **Cookie:** HttpOnly, SameSite=Lax, 7-day expiry, and Secure when the request came over HTTPS or the tunnel.
- **Public endpoints:**
  - health and config;
  - login, logout and `me`;
  - the webhook;
  - the open roles list (with a password set, it returns only open roles and only public fields);
  - applications;
  - starting and completing screenings;
  - PDF reading;
  - `/api/public/*`.
- **Form limits:** applications and bookings are limited to 30 per minute per client. The client is taken from the tunnel's header, so tunnel visitors don't share one limit.
- **Editing settings** needs a password, or a request from the computer the app runs on.

### 9.8 Settings store (`settings.js`)

Settings are grouped: brand, voice engine, safety locks, email, AI keys, security.

- **Secrets are encrypted** with AES-256-GCM. The key is a random 32-byte file next to the database (`<db>.key`, permissions 600, gitignored).
- **Saved values are loaded into the environment**, so they apply live.
- **Saving rules:**
  - a blank secret field keeps the current value;
  - an empty non-secret field clears it, so the `.env` value applies again;
  - types are validated (number, on or off, a fixed choice).
- **Secrets are never returned.** Only the last 4 characters are shown.
- **A damaged or undecryptable row is ignored**; it never crashes the app.

### 9.9 Other modules

- **`mailer.js`:** an SMTP client written on `net` and `tls`. It supports SSL and STARTTLS, logs in with LOGIN, encodes non-ASCII headers, builds multipart text and HTML messages, has a 25-second session timeout and can verify a login without sending.
- **`engine.js`:** the engine room endpoints (overview, trace, preview) and an in-memory trace of the latest 100 entries.
- **`demo-seed.js`:** demo roles and sample leads (`npm run demo`) and test fixtures. They are only loaded when asked for (`SEED_DEMO_ROLES`, `SEED_DEMO_DATA`), so a production database never opens with invented data.

---

## 10. Data model

SQLite file `recruiting.db` (WAL mode). Migrations are in `db/migrations.js`:

| Version | Migration |
|---|---|
| 1 | Core tables |
| 2 | Recruiting suite: role columns, voice agents, tasks, interviews, offers and others |
| 3 | Indexes for the frequent queries |
| 4 | `webhook_deliveries` |
| 5 | `score_audit` |
| 6 | Screening `duration_sec` and `failure_reason` |

Versions 1 and 2 only create tables and columns that are missing, so databases created before migrations existed upgrade in place. That was verified on the live database: 17 candidates, versions 1 to 6 applied.

| Table | Purpose |
|---|---|
| `jobs` | Roles: requirements, budget, accepted cities, must-have skills, extra questions, status, openings, negotiation (on or off, stretch %, notes), voice and agent name, per-role agent ids and the content hash |
| `candidates` | Applicants: form answers, source, resume text, parsed resume summary, LLM analysis, consent time, spot-check flag, hired time, stage |
| `screenings` | AI interviews: mode, status, Dograh run id, transcript, extracted answers, raw payload (capped at 200 KB), start and end, length, failure reason |
| `scores` | Current score per candidate: total, verdict, breakdown, flags |
| `score_audit` | Every automated score: rubric version, inputs hash, total, verdict, breakdown, trigger, time |
| `webhook_deliveries` | Delivery keys already processed, with their outcome |
| `events` | The system timeline per candidate |
| `activities` | Recruiter actions: notes, calls, interviews, stage moves, feedback |
| `feedback` | "Was the AI right?" reviews |
| `recruiters` | The team |
| `tasks` | Background queue: type, payload, when to run, status, attempts, result |
| `interviews`, `scorecards` | Human interviews and their ratings |
| `refs` | References and their answers |
| `offers`, `onboarding` | Offers (with status changes) and onboarding checklists |
| `messages` | Message drafts and their status |
| `settings`, `app_settings` | Automation rules; encrypted application settings |
| `llm_cache`, `llm_usage` | LLM response cache and usage log |
| `schema_migrations` | Applied migration versions |

**Indexes:**
- candidates by role, by stage and by phone;
- screenings by candidate, status and start time, and by run id;
- events by candidate;
- activities by candidate and by recruiter;
- feedback by candidate;
- tasks by status and due time;
- the score audit by candidate.

---

## 11. API reference

The API is JSON. Errors are `{ error, request_id, errors? }`.

Who can call each endpoint:

| Label | Who can call it |
|---|---|
| Public | Anyone, including candidates |
| Admin | Needs a password, or a request from this computer |
| Local | This computer only, or with `METRICS_TOKEN` |
| Login | Needs a dashboard login when a password is set |

**Public and operational**

| Method and path | Access | Purpose |
|---|---|---|
| GET `/api/health` | Public | Liveness check, plus whether Dograh is set up for phone and browser |
| GET `/api/ready` | Public | Readiness check (503 when the database fails) |
| GET `/metrics` | Local | Prometheus metrics |
| GET `/api/config` | Public | Brand, agent name, voice-engine readiness, embed token, questions, rubric |
| GET `/api/jobs` | Public | Open roles |
| POST `/api/applications` | Public, 30/min | Apply |
| POST `/api/resume/pdf` | Public | PDF to text (raw body, 5 MB) |
| POST `/api/candidates/:id/screenings` | Public | Start an interview (`phone`, `web` or `simulator`) |
| POST `/api/screenings/:id/complete` | Public | Finish a typed interview (simulator mode only) |
| POST `/api/public/ice` | Public, gated | Internet TURN credentials for a live browser interview |
| GET `/api/public/slots?c=` | Public | Free interview slots for a candidate |
| POST `/api/public/book` | Public, 30/min | Book an interview slot |
| POST `/api/webhooks/dograh` | Public, optional secret | Interview results |
| `/dograh/*` | Public, 3 paths and the WebSocket only | Voice-engine proxy |
| POST `/api/login`, `/api/logout`, GET `/api/me` | Public, 5/min for login | Session |

**Recruiter** (login required when a password is set)

| Area | Endpoints |
|---|---|
| Candidates | GET `/api/candidates`; GET or DELETE `/api/candidates/:id`; GET `/api/candidates/:id/score-history` and `/suite`; POST `/stage`, `/feedback`, `/activities`, `/resume`, `/analyze`; GET `/kit`; POST `/messages/draft`; GET `/api/export/candidates.csv` |
| Communication | GET and POST `/api/candidates/:id/rejection-email`; POST `/api/rejection-emails/send`; POST `/api/candidates/:id/rejection-call`; POST `/api/messages/:id/status` |
| Hiring | GET `/api/interviews`; POST `/api/candidates/:id/interviews`; POST `/api/interviews/:id/status` and `/scorecard`; POST `/api/candidates/:id/references`; POST `/api/references/:id/call` and `/complete`; POST `/api/candidates/:id/offers`; GET `/api/offers`; POST `/api/offers/:id/status`; POST `/api/onboarding/:id/toggle` |
| Roles | POST `/api/jobs`; PUT `/api/jobs/:id`; POST `/api/jobs/generate`; GET `/api/voices`; GET `/api/jobs/:id/matches`; POST `/api/jobs/:id/matches/:cid/apply` |
| Import | POST `/api/import/csv`; GET `/api/import/batches`; POST `/api/import/call`; GET or DELETE `/api/import/queue` |
| Reporting | GET `/api/stats`, `/api/analytics`, `/api/calls`, `/api/team`, `/api/recruiters`; POST `/api/assistant` |
| Automation | GET and POST `/api/settings`; GET `/api/tasks`; POST `/api/tasks/run`; POST `/api/tasks/:id/retry`; GET `/api/llm/status` |
| Settings | GET and PUT `/api/app-settings`; POST `/api/app-settings/test`, `/create-agents`, `/phone-provider`, `/voice-model`; GET `/api/app-settings/dograh-status` |
| Engine room | GET `/api/engine/overview`, `/api/engine/trace`; POST `/api/engine/preview` |

---

## 12. Frontend (Next.js)

### 12.1 Design system

- **Tokens** (`web/app/globals.css`): background, two surface levels, two border strengths, three text levels, one indigo accent, and success, warning and danger, each with a soft variant. There is a matching dark set. Tailwind 4 `@theme inline` turns them into utility classes (`bg-surface`, `text-muted`, `ring-accent/20` and so on).
- **Theme:**
  - the saved or system theme is applied by an inline script before the first paint, so the page never flashes the wrong theme;
  - a toggle in the header;
  - `color-scheme` is set so native controls match the theme.
- **Typography:** Geist Sans, plus Geist Mono for numbers and ids, with tabular numbers wherever figures are compared.
- **Components:**
  - `Button` (5 variants, 4 sizes, a loading state) and `ButtonLink`;
  - `Card`, with a header and body;
  - `Badge` (5 tones, an optional dot);
  - `Avatar` (a stable, muted colour per name);
  - `ScoreRing`, a circle filled up to the score, coloured by band;
  - `Meter`, `Stat`, `Tabs`, `Skeleton`, `EmptyState`, `PageHeader`, `DefinitionList`, `Kbd`;
  - form controls: `Input`, `Textarea`, `Select`, `Field` (connects the label, help text and error for screen readers), `Switch`, `Checkbox`;
  - `Dialog` and `Sheet` on the native `<dialog>` element.
- **Charts:** a funnel with conversion rates (in plain HTML), a histogram, grouped bars and a donut with its total, all drawn in the token colours with a themed tooltip.

### 12.2 Data and state

- **`api()`:**
  - sends JSON, with credentials;
  - on 401 from a protected endpoint, it fires an `auth:required` event, which the dashboard shell turns into a redirect to `/login?next=…`;
  - errors carry the server's message and field details.
- **`useApi()`:** SWR with optional polling. Live views poll:

  | View | Refresh |
  |---|---|
  | Pipeline | 5 s |
  | Interviews log | 5 s |
  | Overview stats | 10 s |
  | Candidate page | 8 s |
- **Actions:** stage moves update the screen immediately and roll back if the save fails. Saving a setting confirms with a notification.
- **The recruiter picker** is stored in local storage and kept in sync across components with a custom event.

### 12.3 Pages

| Route | Rendering | Notes |
|---|---|---|
| `/` | Static page, client data | Hero section, how the interview works, open roles, redirects old `?role=` links |
| `/apply/[jobId]` | Dynamic | Two columns: the role on the left (sticky, with a 3-step progress list), the form or interview on the right |
| `/book` | Static page, client data | Slots grouped by day, the existing booking, a "not open yet" state |
| `/login` | Static | Sign-in with errors and a return to the page you came from |
| `/dashboard/*` | Static shell, client data | 13 pages (see section 2) |

### 12.4 Accessibility and responsive layout

- Labels are connected to their controls; errors use `aria-invalid` and `aria-describedby`.
- Tabs use the tab roles; switches and the rating buttons use switch and radio roles.
- Dialogs trap focus and close on Escape.
- Keyboard focus is always visible.
- The live transcript is a live region, so screen readers announce it.
- The sidebar becomes a drawer below the `lg` breakpoint.
- Tables scroll sideways on small screens.
- The pipeline board scrolls sideways.
- The interview room stacks the transcript under the avatar on phones.

### 12.5 Verification

`next build` compiles and type-checks every page (strict TypeScript). Every page was checked in a production build against a copy of the live database, with screenshots of light and dark mode taken headless. Dev mode with hot reload was checked through the custom server.

---

## 13. Security and privacy

| Threat | Control |
|---|---|
| Ringing people who never agreed | Allowlist until `IMPORT_CALL_ANY=1`; recorded consent; no repeat call within 10 minutes; calling-hours windows; every rejection or bulk call needs an explicit confirmation |
| Emailing real candidates during a demo | `MAIL_ALLOWLIST` until `MAIL_SEND_ANY=1`; duplicate guard; bulk send capped at 25 per click |
| Unauthenticated access to candidate data | Password and session gate; over the tunnel, only the webhook and health are reachable until a password is set; settings can only be edited with a password or from this computer |
| Guessing the password | 5 attempts per minute per client; constant-time comparison; signed, expiring sessions that are invalidated when the password changes |
| Fake interview results | Optional webhook secret (constant time); the run is re-read from Dograh instead of trusting the payload; repeats are ignored; the simulator endpoint refuses voice interviews |
| Exposing the voice engine | The proxy allows only 3 paths and the WebSocket; it never adds the API key; it has a timeout |
| Strangers using up the TURN relay | Credentials only for a live browser interview |
| Leaking secrets | AES-256-GCM at rest; masked in the API and the UI; redacted in logs; `.env`, the database, the key file and the allowlist are gitignored and kept out of the Docker image |
| Injection and traversal | SQL parameters everywhere; size-capped request bodies; PDF magic-byte check; route parameters limited to `[\w-]`; CSV export cells that start with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets don't run them as formulas |
| Browser attacks | `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` (microphone allowed only for this site); `no-store` on API responses |
| Personal data sent to AI providers | Emails and phone numbers removed from every LLM prompt; a bias guard in every judging prompt |
| Right to erasure | "Erase data" deletes the candidate and every related row (12 tables) |
| Weak dependency hygiene | Exact version pins; upgraded to Next.js 16.4.5 after `npm audit` flagged a high-severity issue in the 15.x line (0 vulnerabilities now) |

---

## 14. Testing

| Suite | Command | Count | What it covers |
|---|---|---|---|
| Unit | `npm run test:unit` | 21 | See below |
| End-to-end | `npm run test:e2e` | 43 | See below |
| Evals | `npm run eval` | 15 cases | Section 8 |
| Coverage | `npm run coverage` | about 87% of lines in the unit-tested modules | Built-in Node.js coverage |
| Type checks | `npm run typecheck` (lib and evals, JSDoc checked by tsc) and `npm run build` (every page, strict) | | |
| Syntax | `npm run check` | 33 files | Every server file parses |

**Unit tests:**
- the router, body reader and reply marker;
- the schema validator;
- retries and the circuit breaker, including half-open and client errors not counting;
- the rate limiter;
- the Prometheus output;
- migrations: run once, in order, rolled back on failure, nested transactions;
- sessions: expiry, password rotation, tampering;
- log redaction;
- config validation;
- the prompt and variable contract, and the prompt being identical in both files;
- negotiation context in LPA;
- webhook parsing with raw newlines;
- spoken-answer parsing;
- merging the run transcript;
- the incomplete-call rules;
- whole-word skill matching;
- name-swap and personal-detail fairness;
- the rubric version and the rubric summing to 100.

**End-to-end tests** (a real server process, a mock Dograh, a mock SMTP server):
- answer parsing and the rubric;
- application validation;
- a typed interview, start to finish;
- a phone interview through the mock Dograh, with the webhook scoring it;
- matching a browser interview by the candidate id in the context;
- the resume flowing into the interview variables and the probes;
- PDF reading;
- recruiter actions, team metrics and the interviews log;
- the engine room (keys masked, preview, trace);
- the tunnel guard, the relay-credential gate and the proxy path allowlist;
- the stringified-context fix;
- CSV import;
- the call-queue lock;
- negotiation scoring;
- the rejection call and email (lock, real SMTP send, duplicate guard, bulk);
- the public form being unable to ring strangers;
- per-role voices, including on standard Dograh;
- the settings page (encryption, masking, live application, locks);
- the settings helpers (mailbox test, connection test, creating agents, phone provider, voice model);
- API-only mode.

**Not tested automatically:** a real voice interview (it needs a microphone and the voice model), and browser-level interaction tests of the web pages. See section 19.

---

## 15. CI, build and deployment

### 15.1 GitHub Actions (`.github/workflows/ci.yml`)

- **`test` job** (Node 22 and 24), in order:
  1. `npm ci`
  2. Install `pdftotext`
  3. Syntax check
  4. Type check
  5. Unit tests
  6. End-to-end tests
  7. Evals
  8. `next build`
  9. Smoke test: start in production mode and request `/`, `/dashboard`, `/dashboard/pipeline`, `/login` and `/book`
- **`coverage` job:** coverage, plus the eval report uploaded as an artifact.
- **`docker` job:** builds the image, runs it and polls `/api/health`.
- Running jobs are cancelled when new commits land on the same branch.

### 15.2 Docker

A multi-stage `Dockerfile`:
- **Build stage:** `npm ci` and `next build web`.
- **Runtime stage:** `npm ci --omit=dev`, `pdftotext`, the API code and the built web app only.
- **Runtime settings:**
  - runs as the non-root `node` user;
  - `NODE_ENV=production` and JSON logs;
  - the `/data` volume for the database;
  - a `HEALTHCHECK`.
- **`.dockerignore`** keeps secrets, databases, tests, evals and build caches out of the image.
- **`docker-compose.yml`** mounts `./data` and the allowlist read-only.

### 15.3 Local scripts

| Command | What it does |
|---|---|
| `npm run dev` | API and web app with hot reload; opens the browser |
| `npm start` | Checks the Node version, the database folder, `pdftotext` and the port; builds the web app on first run; starts in production mode |
| `npm run build` | Builds the web app |
| `npm run demo` | Start, plus demo roles and sample leads |
| `npm run doctor` | Explains in plain words what is missing or broken |
| `npm run setup:dograh` | Creates the screener and rejection agents in Dograh |
| `npm run seed` | Adds demo data |

### 15.4 Current deployment

The app runs on a Windows laptop:
- **Recruit OS:** Node 22.17 on port 4870.
- **Dograh:** Docker Compose in `F:\Lumos Logic\dograh` with the `local-turn` profile (coturn), and a compose override that fixes the UI's health-check timeout.
- **Cloudflare quick tunnel** (container `recruit-os-tunnel`) for colleagues.

After the Next.js release, the live app was restarted and checked through the tunnel: every page loads, the dashboard requires a login, Dograh answers through the proxy and the interview token is accepted.

---

## 16. Operations

- **Health:** `/api/health` (liveness) and `/api/ready` (database, Dograh, breaker state, uptime).
- **Metrics:** `/metrics` (Prometheus). The useful signals:
  - `http_request_duration_seconds` by route;
  - `screenings_total{mode,outcome}`: started, completed, incomplete, trigger failed;
  - `webhooks_total{outcome}`: completed, incomplete, duplicate, unauthorised, unknown candidate;
  - `dograh_requests_total{outcome}`: ok, error, circuit open;
  - `tasks_failed`.
- **Logs:** structured lines with request ids. Each finished interview logs one line with the candidate, mode, outcome, run id, length, score and verdict.
- **Engine room:** a live trace of calls out, webhooks in and agent syncs, for debugging without reading logs.
- **Graceful shutdown** on SIGTERM or SIGINT:
  - the worker stops;
  - the server stops accepting connections and idle ones close;
  - proxied interview sockets are ended;
  - in-flight requests get up to 10 seconds;
  - then the database closes.
- **Database upgrades** run automatically at startup and are logged.

---

## 17. Configuration reference

All settings can go in `.env` or on the Settings page; the Settings page wins. The full list is in `.env.example`.

| Group | Keys |
|---|---|
| Server | `PORT`, `DB_PATH`, `NODE_ENV`, `RECRUIT_UI`, `LOG_LEVEL`, `LOG_FORMAT`, `METRICS_TOKEN`, `SEED_DEMO_ROLES`, `SEED_DEMO_DATA` |
| Brand | `BRAND_NAME`, `AGENT_NAME`, `PUBLIC_BASE_URL`, `CAREERS_URL` |
| Voice engine | `DOGRAH_BASE_URL`, `DOGRAH_API_KEY`, `DOGRAH_AGENT_UUID`, `DOGRAH_WORKFLOW_ID`, `DOGRAH_REJECTION_AGENT_UUID`, `DOGRAH_REJECTION_WORKFLOW_ID`, `DOGRAH_REFERENCE_AGENT_UUID`, `DOGRAH_REMINDER_AGENT_UUID`, `DOGRAH_EMBED_TOKEN`, `WEBHOOK_SECRET`, `DOGRAH_CAPS_TTL_MS`, `DOGRAH_BREAKER_THRESHOLD`, `DOGRAH_BREAKER_COOLDOWN_MS` |
| Internet relay | `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| Safety | `IMPORT_CALL_ALLOWLIST`, `IMPORT_CALL_ANY`, `MAIL_ALLOWLIST`, `MAIL_SEND_ANY`, `SPOT_CHECK_RATE` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO`, `MAIL_SIGNATURE_NAME` |
| AI | `GROQ_API_KEY`, `ZAI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `LLM_CUSTOM_URL`, `LLM_CUSTOM_KEY`, `LLM_CUSTOM_MODEL`, `LLM_CHAIN`, `LLM_DAILY_CAP`, `LLM_TIMEOUT_MS`, `LLM_DISABLE`, per-provider `*_MODEL` |
| Security | `ADMIN_PASSWORD`, `SESSION_SECRET` |

At startup, problems that would break the server (a bad port or URL) stop the boot. Risky but working settings are logged as warnings: a short password, a missing session secret or webhook secret, or production calling switched on.

---

## 18. Engineering process

- **Branches:** each change was made on a short-lived branch (`feat/`, `fix/`, `ci/`, `docs/`, `chore/`), merged into `main` with a merge commit, and pushed. The current history:

  ```
  feat/nextjs-app                 Next.js dashboard, candidate side, Docker/CI, docs (5 commits)
  fix/metrics-route-labels        metrics route labels
  chore/typecheck                 tsc over JSDoc in CI
  docs/architecture-and-security  architecture and security docs
  ci/pipeline-and-docker          CI pipeline, hardened image
  feat/interview-evals            eval harness
  fix/scoring-skill-matching      stemmed whole-word skills, personal-attribute filter, stretch-aware salary fit
  main (initial)                  import → infrastructure layer → migrations → services/routes split → unit tests
  ```
- **Commit messages** describe what changed and why.
- **The backend refactor** split a monolithic server file into layers with no change in behaviour. All the existing end-to-end tests stayed green at every step, and the refactor was then tested against a copy of the live database.
- **Labels fixed by the evals** are documented in the cases file instead of being hidden.

---

## 19. Known limitations and next steps

Listed honestly, roughly by impact.

1. **`suite.js` is still one large module** (about 1,100 lines) with hand-written routing. The next step is to split it into services and routes the way the server was split (roles, import, interviews, offers, messages, settings, automation), each with unit tests.
2. **Answer quality is scored by rules only.**
   - The next step is to have an LLM grade answers against a fixed output format (a score for each part plus quoted evidence), keep the rules as the fallback, and add an eval that the two agree.
   - Today the LLM only gives a second opinion; it never changes the score.
3. **No browser-level tests of the web pages.** The pages are covered by the build's type checks and the CI smoke test, not by interaction tests. Playwright tests for apply → typed interview → score, logging in, and a pipeline drag are the next step.
4. **State that lives in one process:**
   - the call queue is in memory and is lost on restart; it should move to the database task queue;
   - the rate limiter and the trace buffer would need Redis to run more than one instance.
5. **SQLite and one instance.** That's fine for one company. Several companies, or several instances, would need Postgres; the SQL is plain and goes through one access layer.
6. **Type checking covers only the API's infrastructure layer.** The services and routes need typed database rows before they can be checked strictly. The web app is fully strict.
7. **There's no CSP on the Next.js pages.** Pages get the other security headers. A strict CSP needs per-request nonces, which Next.js supports through its middleware (called "proxy" in Next.js 16).
8. **`WEBHOOK_SECRET` isn't set** in the current deployment, so anyone who finds the link could post fake interview results. The app warns about it at startup.
9. **Concurrency is bound by the voice engine** (3 to 5 interviews at once on the laptop). Production needs Dograh on its own host with more workers.
10. **The quick-tunnel URL changes when the tunnel restarts.** A named tunnel or a real deployment fixes that.
11. **Language:** the interview runs in Indian English. Hindi or Hinglish answers depend on the voice model, and the rule-based parser doesn't handle Hindi number words.

---

## 20. Review checklist

Suggested order for reading the code:

1. `docs/ARCHITECTURE.md`, then `server.js`: how everything is wired together and the request pipeline.
2. `services/interviews.js` `handleWebhook`: idempotency, the transaction, re-reading the run from Dograh.
3. `scoring.js` `scoreCandidate` and `evidenceOf`, with `evals/cases.json` and `npm run eval`.
4. `services/screening.js` and `dograh/screener-prompt.txt`, with `tests/unit/interview-contract.test.mjs`.
5. `services/dograh.js` and `lib/resilience.js`: the retry policy (reads only) and the breaker.
6. `web/lib/dograh-session.ts` and `web/components/interview/call-room.tsx`: the browser interview.
7. `web/app/dashboard/candidates/[id]/page.tsx` and `web/components/candidate/*`: the main recruiter page.
8. `lib/session.js`, `suite.js` (the authentication section) and `settings.js` (encryption).
9. `.github/workflows/ci.yml` and the `Dockerfile`.

To run it:

```bash
npm install
npm test && npm run eval && npm run build
npm run dev          # http://localhost:4870  and  /dashboard
```
