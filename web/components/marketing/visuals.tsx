// Illustrations for the landing page, drawn with the real design-system pieces so they match the product.
// The names and numbers are sample data.
import { CheckCircle2, Clock, Mic, PhoneCall, Quote, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, Badge, Meter, ScoreRing } from '@/components/ui/primitives';

function WindowFrame({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_30px_80px_-20px_rgb(28_25_23/0.25)] ring-1 ring-black/[0.02] dark:shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)]', className)}>
      <div className="flex h-9 items-center gap-1.5 border-b border-border bg-surface-2/60 px-3.5">
        <span className="size-2.5 rounded-full bg-border-strong" /><span className="size-2.5 rounded-full bg-border-strong" /><span className="size-2.5 rounded-full bg-border-strong" />
        <span className="ml-3 truncate font-mono text-[11px] text-subtle">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function Waveform({ bars = 28, className }: { bars?: number; className?: string }) {
  return (
    <div className={cn('flex h-8 items-center gap-[3px] overflow-hidden', className)} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="animate-wave w-[3px] rounded-full bg-current" style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${(i * 83) % 900}ms` }} />
      ))}
    </div>
  );
}

const RUBRIC = [
  { label: 'Answer quality', points: 26, max: 30 },
  { label: 'Experience', points: 20, max: 20 },
  { label: 'Must-have skills', points: 12, max: 15 },
  { label: 'Salary fit', points: 15, max: 15 },
  { label: 'Notice period', points: 5, max: 10 },
  { label: 'Location', points: 10, max: 10 },
];
const total = RUBRIC.reduce((s, r) => s + r.points, 0);

export function HeroProduct() {
  return (
    <WindowFrame title="hirevox / interviews / ananya-rao" className="mx-auto max-w-5xl">
      <div className="grid md:grid-cols-[1.15fr_1fr]">
        <div className="border-b border-border p-5 md:border-r md:border-b-0 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="relative grid size-11 place-items-center rounded-full bg-accent text-accent-fg">
              <span className="animate-pulse-ring absolute inset-0 rounded-full bg-accent" />
              <Mic className="relative size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">Kiara · AI recruiter</p>
              <p className="flex items-center gap-1.5 text-[12px] text-muted"><span className="size-1.5 rounded-full bg-success" />Live · Software Engineer screen</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1 font-mono text-[12px] text-muted tabular-nums"><Clock className="size-3" />04:12</span>
          </div>
          <Waveform className="mt-5 text-accent" bars={40} />
          <ul className="mt-5 space-y-3 text-[13px]">
            <li className="max-w-[88%] rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-2.5 leading-relaxed">Your resume mentions a payments service. What did you change, and how did you know it worked?</li>
            <li className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-accent-soft px-3.5 py-2.5 leading-relaxed text-fg">I rebuilt the retry queue in Go. Failed payouts dropped from 2.1% to 0.3%, about ₹40 lakh a month recovered.</li>
            <li className="max-w-[88%] rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-2.5 leading-relaxed">That is a big drop. What is your expected salary?</li>
          </ul>
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <ScoreRing value={total} size={64} stroke={5} />
            <div>
              <p className="text-[12px] text-muted">Interview score</p>
              <div className="mt-1 flex items-center gap-2"><Badge tone="success" dot>Strong</Badge><span className="text-[12px] text-subtle">rubric 2026.11</span></div>
            </div>
          </div>
          <ul className="mt-5 space-y-2.5">
            {RUBRIC.map(r => (
              <li key={r.label}>
                <div className="mb-1 flex justify-between text-[12px]"><span className="text-muted">{r.label}</span><span className="font-mono tabular-nums">{r.points}/{r.max}</span></div>
                <Meter value={r.points} max={r.max} tone={r.points / r.max >= 0.75 ? 'success' : 'warning'} />
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-lg border border-border bg-surface-2/60 p-3 text-[12px] leading-relaxed text-muted">
            <Quote className="mb-1 size-3.5 text-accent" />
            &ldquo;Failed payouts dropped from 2.1% to 0.3%&rdquo; <span className="text-subtle">· counted under answer quality as a measured result</span>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

export function RubricCard() {
  const evidence: Record<string, string> = {
    'Answer quality': '"Cut build time from 14 to 4 minutes for 60 engineers."',
    'Must-have skills': 'Mentioned Go, Postgres, Kafka. Missing: Kubernetes.',
    'Notice period': '60 days against a 30-day limit. Flagged for review.',
  };
  return (
    <WindowFrame title="score breakdown · explainable">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><Avatar name="Rohan Mehta" size={36} /><div><p className="text-[13.5px] font-semibold">Rohan Mehta</p><p className="text-[12px] text-muted">Backend Engineer · 5 yrs</p></div></div>
          <ScoreRing value={81} size={48} />
        </div>
        <ul className="mt-5 divide-y divide-border">
          {RUBRIC.map((r, i) => {
            const pts = [24, 20, 11, 15, 1, 10][i];
            return (
              <li key={r.label} className="py-3">
                <div className="flex items-center gap-3 text-[13px]">
                  <span className="w-32 shrink-0 text-muted">{r.label}</span>
                  <Meter className="flex-1" value={pts} max={r.max} tone={pts / r.max >= 0.75 ? 'success' : pts / r.max >= 0.4 ? 'warning' : 'danger'} />
                  <span className="w-12 text-right font-mono text-[12px] tabular-nums">{pts}/{r.max}</span>
                </div>
                {evidence[r.label] && <p className="mt-1.5 pl-35 text-[12px] leading-relaxed text-subtle max-sm:pl-0">{evidence[r.label]}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </WindowFrame>
  );
}

const BOARD = [
  { stage: 'Screening', tone: 'neutral' as const, cards: [{ n: 'Meera Iyer', r: 'Sales Lead', s: null, live: true }, { n: 'Arjun Nair', r: 'Backend', s: null }] },
  { stage: 'Review', tone: 'warning' as const, cards: [{ n: 'Kabir Singh', r: 'Backend', s: 64 }, { n: 'Sara Khan', r: 'Support', s: 58 }] },
  { stage: 'Shortlisted', tone: 'success' as const, cards: [{ n: 'Ananya Rao', r: 'Backend', s: 88 }, { n: 'Dev Patel', r: 'Sales Lead', s: 79 }] },
  { stage: 'Interview', tone: 'accent' as const, cards: [{ n: 'Ishita Das', r: 'Support', s: 84 }] },
];

export function PipelineBoard() {
  return (
    <WindowFrame title="hirevox / dashboard / pipeline">
      <div className="grid grid-cols-2 gap-3 p-4 sm:p-5 lg:grid-cols-4">
        {BOARD.map(col => (
          <div key={col.stage} className="rounded-xl bg-surface-2/70 p-2.5">
            <div className="mb-2.5 flex items-center justify-between px-1"><Badge tone={col.tone} dot>{col.stage}</Badge><span className="font-mono text-[11px] text-subtle">{col.cards.length}</span></div>
            <ul className="space-y-2">
              {col.cards.map(c => (
                <li key={c.n} className="rounded-lg border border-border bg-surface p-2.5 shadow-card">
                  <div className="flex items-center gap-2"><Avatar name={c.n} size={24} /><span className="min-w-0 truncate text-[12.5px] font-medium">{c.n}</span></div>
                  <div className="mt-2 flex items-center justify-between text-[11.5px] text-muted">
                    <span>{c.r}</span>
                    {c.s != null ? <span className="font-mono font-semibold text-fg tabular-nums">{c.s}</span>
                      : 'live' in c ? <span className="inline-flex items-center gap-1 text-accent"><PhoneCall className="size-3" />On call</span>
                      : <span className="text-subtle">Queued</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}

export function AssistantBubble() {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 text-[12.5px] shadow-card">
      <p className="flex items-center gap-1.5 font-medium"><Sparkles className="size-3.5 text-accent" />Assistant</p>
      <p className="mt-1.5 text-muted">3 backend candidates scored above 80 this week. Ananya Rao is the only one inside budget with a 30-day notice.</p>
      <p className="mt-2 inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" />Based on 14 scored interviews</p>
    </div>
  );
}
