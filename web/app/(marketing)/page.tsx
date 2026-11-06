import type { Metadata } from 'next';
import {
  ArrowRight, BadgeIndianRupee, BellRing, CalendarCheck, CheckCircle2, ClipboardCheck, FileSearch, FileText, Globe, History,
  KeyRound, Lock, Mic, PhoneCall, Plus, Scale, ServerCog, ShieldCheck, Sparkles, Upload, UserCheck, Workflow,
} from 'lucide-react';
import { PRODUCT, PRODUCT_TAGLINE } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { ButtonLink } from '@/components/ui/button';
import { AssistantBubble, HeroProduct, PipelineBoard, RubricCard, Waveform } from '@/components/marketing/visuals';

export const metadata: Metadata = {
  title: { absolute: `${PRODUCT}: AI voice interviews for every applicant` },
  description: PRODUCT_TAGLINE,
};

function SectionHeading({ eyebrow, title, text, center }: { eyebrow: string; title: React.ReactNode; text?: React.ReactNode; center?: boolean }) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <p className="text-[12.5px] font-semibold tracking-wide text-accent uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-[30px] leading-[1.15] font-semibold tracking-tight text-balance sm:text-[38px]">{title}</h2>
      {text && <p className="mt-4 text-[15.5px] leading-relaxed text-muted text-pretty">{text}</p>}
    </div>
  );
}

/* 1. Hero ---------------------------------------------------------------------------------------- */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,var(--accent-soft),transparent_70%)]" />
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
      </div>
      <div className="mx-auto max-w-6xl px-5 pt-16 pb-20 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <a href="#how" className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pr-3 pl-1 text-[12.5px] text-muted shadow-card backdrop-blur transition-colors hover:text-fg">
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">New</span>
            Resume-aware questions and salary negotiation <ArrowRight className="size-3" />
          </a>
          <h1 className="mt-7 text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-[60px]">
            Interview every applicant.<br className="hidden sm:block" /> <span className="bg-gradient-to-r from-accent to-[#a855f7] bg-clip-text text-transparent">Hire the right one.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[16.5px] leading-relaxed text-muted text-pretty sm:text-[18px]">
            {PRODUCT} runs a six-minute voice interview the moment someone applies, scores it on a 100-point rubric you can check line by line, and gives your team a ranked shortlist.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/dashboard" variant="primary" size="lg" className="h-11 px-5">Open the dashboard<ArrowRight className="size-4" /></ButtonLink>
            <ButtonLink href="/careers" size="lg" className="h-11 px-5"><Mic className="size-4" />Try a live interview</ButtonLink>
          </div>
          <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[12.5px] text-muted">
            {['Runs on your own server', 'Browser or phone', 'A person approves every decision'].map(t => <li key={t} className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-success" />{t}</li>)}
          </ul>
        </div>
        <div className="relative mt-16">
          <div aria-hidden className="absolute inset-x-10 -top-6 -bottom-6 -z-10 rounded-[32px] bg-gradient-to-b from-accent/15 to-transparent blur-2xl" />
          <HeroProduct />
        </div>
      </div>
    </section>
  );
}

/* 2. Numbers and stack -------------------------------------------------------------------------- */
const STATS = [
  { value: '~6 min', label: 'per interview, started the moment someone applies' },
  { value: '100', label: 'point rubric, every point traced to an answer' },
  { value: '24/7', label: 'interviews keep running after office hours' },
  { value: '0', label: 'scheduling emails before the first conversation' },
];
const STACK = ['Dograh', 'Deepgram', 'Groq', 'Sarvam AI', 'Twilio', 'Cloudflare', 'Next.js', 'SQLite'];

function Numbers() {
  return (
    <section className="border-y border-border bg-surface">
      <div className="mx-auto max-w-6xl px-5">
        <dl className="grid grid-cols-2 divide-border lg:grid-cols-4 lg:divide-x">
          {STATS.map(s => (
            <div key={s.value} className="px-2 py-9 lg:px-8">
              <dt className="sr-only">{s.label}</dt>
              <dd className="text-[34px] font-semibold tracking-tight tabular-nums">{s.value}</dd>
              <dd className="mt-1 max-w-[220px] text-[13px] leading-snug text-muted">{s.label}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-border py-6">
          <span className="text-[12px] text-subtle">Built on open voice infrastructure</span>
          {STACK.map(s => <span key={s} className="text-[14px] font-semibold tracking-tight text-subtle">{s}</span>)}
        </div>
      </div>
    </section>
  );
}

/* 3. How it works ------------------------------------------------------------------------------- */
const STEPS = [
  { icon: Upload, title: 'Candidates come in', text: 'They apply on your careers page, or you import a CSV from Naukri, Indeed or any job board.' },
  { icon: Mic, title: 'The AI interviews them', text: 'A natural voice conversation in the browser or by phone, with questions drawn from their resume.' },
  { icon: FileSearch, title: 'Every answer is scored', text: 'The 100-point rubric checks experience, salary, notice, location, skills and answer quality.' },
  { icon: UserCheck, title: 'Your team decides', text: 'Review a ranked shortlist with transcripts and evidence, then schedule, offer and onboard.' },
];

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
      <SectionHeading center eyebrow="How it works" title="From application to shortlist in minutes, not weeks" text="No phone tag and no scheduling links. The first-round interview happens while the candidate is still interested." />
      <ol className="relative mt-16 grid gap-5 md:grid-cols-4">
        <div aria-hidden className="absolute top-6 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent md:block" />
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="flex items-center justify-between">
              <span className="grid size-12 place-items-center rounded-xl bg-fg text-bg"><s.icon className="size-5" /></span>
              <span className="font-mono text-[12px] text-subtle">0{i + 1}</span>
            </div>
            <h3 className="mt-5 text-[15.5px] font-semibold tracking-tight">{s.title}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* 4. Features ----------------------------------------------------------------------------------- */
const FEATURES = [
  { icon: FileText, title: 'Resume-aware questions', text: 'Reads the PDF and asks about the projects and claims in it, so answers are specific and hard to rehearse.' },
  { icon: BadgeIndianRupee, title: 'Salary negotiation', text: 'Negotiates inside the budget you set for each role and records the agreed number.' },
  { icon: Upload, title: 'Bulk import and call queue', text: 'Import thousands of leads from a CSV. The queue only dials numbers you have allowed.' },
  { icon: CalendarCheck, title: 'Scheduling and offers', text: 'Interview panels, scorecards, offer letters, onboarding checklists and reference checks.' },
  { icon: Workflow, title: 'Background automation', text: 'Stage changes, message drafts, reminders and re-scoring run on their own, and any step can be retried.' },
  { icon: BellRing, title: 'Candidate messages', text: 'Interview links, reminders and kind, specific rejection emails drafted for you.' },
];

function Features() {
  return (
    <section id="features" className="border-t border-border bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
        <SectionHeading eyebrow="Features" title="Everything after “Apply”, in one workspace" text="A complete hiring pipeline built around the AI interview, from the first conversation to the signed offer." />
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-7 shadow-card lg:col-span-2">
            <span className="grid size-10 place-items-center rounded-lg bg-accent-soft text-accent"><PhoneCall className="size-5" /></span>
            <h3 className="mt-5 text-[19px] font-semibold tracking-tight">Voice interviews in the browser or by phone</h3>
            <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">Candidates talk from any laptop or phone, with no app to install. Each role can have its own questions and voice, and the agent switches to Hindi or Hinglish when the candidate does.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface-2/60 p-4">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg"><span className="animate-pulse-ring absolute inset-0 rounded-full bg-accent" /><Mic className="relative size-4" /></span>
              <Waveform className="min-w-0 flex-1 text-accent" bars={48} />
              <span className="font-mono text-[12px] text-muted">English · हिन्दी</span>
            </div>
          </div>
          <div className="flex flex-col rounded-2xl border border-border bg-surface p-7 shadow-card">
            <span className="grid size-10 place-items-center rounded-lg bg-accent-soft text-accent"><Sparkles className="size-5" /></span>
            <h3 className="mt-5 text-[19px] font-semibold tracking-tight">Ask your pipeline anything</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">A built-in assistant answers questions about candidates and roles using your real data.</p>
            <div className="mt-auto pt-6"><AssistantBubble /></div>
          </div>
          {FEATURES.map(f => (
            <div key={f.title} className="group rounded-2xl border border-border bg-surface p-6 shadow-card transition-[border,box-shadow] hover:border-border-strong hover:shadow-pop">
              <f.icon className="size-5 text-accent" />
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 5. Explainable scoring ------------------------------------------------------------------------ */
function Scoring() {
  const points = [
    'Six weighted parts add up to 100: experience, salary fit, notice period, location, must-have skills and answer quality.',
    'Answer quality rewards measured results like “cut costs by 30%” over vague claims.',
    'Hard limits, such as salary far over budget, are flagged instead of quietly lowering the score.',
    'Every score is saved with its rubric version, so you can see how and why it changed.',
  ];
  return (
    <section id="scoring" className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:py-28 lg:grid-cols-2">
      <div>
        <SectionHeading eyebrow="Explainable scoring" title="A score you can check, not a black box" text="Recruiters see exactly where each point came from, with the candidate's own words next to it." />
        <ul className="mt-8 space-y-4">
          {points.map(p => <li key={p} className="flex gap-3 text-[14px] leading-relaxed"><CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-success" /><span className="text-muted">{p}</span></li>)}
        </ul>
      </div>
      <RubricCard />
    </section>
  );
}

/* 6. Recruiter workspace ------------------------------------------------------------------------ */
function Workspace() {
  const items = [
    { icon: ClipboardCheck, title: 'Ranked pipeline', text: 'Drag candidates between stages. Strong scores move to the shortlist automatically.' },
    { icon: History, title: 'Full interview record', text: 'Transcript, answers, score history and every stage change in one timeline.' },
    { icon: Globe, title: 'Built for teams', text: 'Recruiters, hiring managers, panels and scorecards, with every action attributed.' },
  ];
  return (
    <section className="relative overflow-hidden bg-[#0f0d1a] text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_80%_0%,rgb(99_102_241/0.35),transparent),radial-gradient(40%_50%_at_0%_100%,rgb(168_85_247/0.2),transparent)]" />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <div>
            <p className="text-[12.5px] font-semibold tracking-wide text-[#a5b4fc] uppercase">Recruiter workspace</p>
            <h2 className="mt-3 text-[30px] leading-[1.15] font-semibold tracking-tight text-balance sm:text-[38px]">See your whole pipeline at a glance</h2>
          </div>
          <p className="text-[15.5px] leading-relaxed text-white/65">Live interviews, fresh scores and the next action for every candidate, updating as calls finish. Light and dark themes, keyboard friendly, and fast on any screen.</p>
        </div>
        <div className="dark mt-14 text-fg"><PipelineBoard /></div>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {items.map(i => (
            <div key={i.title} className="flex gap-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15"><i.icon className="size-4" /></span>
              <div><h3 className="text-[14.5px] font-semibold">{i.title}</h3><p className="mt-1 text-[13.5px] leading-relaxed text-white/60">{i.text}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 7. Trust and fairness ------------------------------------------------------------------------- */
const TRUST = [
  { icon: UserCheck, title: 'People make every decision', text: 'The AI ranks and explains. Only your team can hire, reject or make an offer.' },
  { icon: Scale, title: 'Tested for fairness', text: 'Name, age, gender, religion, caste and family details never change a score. Fairness tests gate every release.' },
  { icon: History, title: 'Full audit trail', text: 'Each score is stored with the rubric version and what triggered it.' },
  { icon: ServerCog, title: 'Your data, your server', text: 'Self-hosted on a single database file. Nothing is shared with other customers.' },
  { icon: KeyRound, title: 'Locked down by default', text: 'Signed, expiring sessions, rate-limited sign-in, encrypted API keys and verified webhooks.' },
  { icon: Lock, title: 'Safe calling', text: 'Imported leads are only called when their numbers are on your allowlist.' },
];

function Trust() {
  return (
    <section id="trust" className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
      <SectionHeading center eyebrow="Trust and fairness" title="Responsible AI, built in from the first line" text="Hiring decisions affect people's lives. These protections are part of the product, not optional extras." />
      <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {TRUST.map(t => (
          <div key={t.title} className="bg-surface p-7">
            <span className="grid size-10 place-items-center rounded-lg bg-success-soft text-success"><t.icon className="size-5" /></span>
            <h3 className="mt-5 text-[15px] font-semibold tracking-tight">{t.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{t.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* 8. FAQ ---------------------------------------------------------------------------------------- */
const FAQ = [
  ['Does the AI decide who gets hired?', 'No. It interviews, scores and explains. Moving a candidate forward, rejecting them or making an offer is always done by a person on your team.'],
  ['What does the candidate need?', 'A browser with a microphone, on a laptop or phone. No app and no account. If they prefer, the interview can happen over a normal phone call.'],
  ['Which languages are supported?', 'English, Hindi and Hinglish. The agent follows whichever language the candidate speaks. More languages depend on the speech providers you connect.'],
  ['Can we change the questions and the rubric?', 'Yes. Each role has its own must-have skills, budget, notice limit, locations and custom questions, and the agent adapts to the candidate’s resume.'],
  ['Where is candidate data stored?', `On your own server, in a single SQLite database. ${PRODUCT} is self-hosted, so recordings, transcripts and scores never leave your infrastructure unless you send them.`],
  ['What does an interview cost?', 'You pay the speech and language providers you choose directly. With low-cost providers a six-minute browser interview costs a few rupees.'],
];

function Faq() {
  return (
    <section id="faq" className="border-t border-border bg-surface-2/40">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:py-28 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" text={<>Something else? Sign in and ask the built-in assistant, or read the docs in the repository.</>} />
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-6 py-1 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[14.5px] font-medium">
                {q}<Plus className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-45" />
              </summary>
              <p className="pb-5 text-[14px] leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 9. Call to action ----------------------------------------------------------------------------- */
function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <div className="relative overflow-hidden rounded-3xl bg-[#0f0d1a] px-6 py-16 text-center text-white sm:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(99_102_241/0.45),transparent)]" />
        <div className="relative mx-auto max-w-2xl">
          <ShieldCheck className="mx-auto size-8 text-[#a5b4fc]" />
          <h2 className="mt-5 text-[30px] leading-[1.15] font-semibold tracking-tight text-balance sm:text-[40px]">Your next great hire is already in the applicant list</h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-white/65">Give every applicant a real conversation, and give your team back the hours spent on first-round calls.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/dashboard" size="lg" className="h-11 border-transparent bg-white px-5 text-[#0f0d1a] hover:bg-white/90">Open the dashboard<ArrowRight className="size-4" /></ButtonLink>
            <ButtonLink href="/careers" size="lg" className="h-11 border-white/20 bg-white/5 px-5 text-white hover:bg-white/10">See open roles</ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Numbers />
      <HowItWorks />
      <Features />
      <Scoring />
      <Workspace />
      <Trust />
      <Faq />
      <FinalCta />
    </>
  );
}
