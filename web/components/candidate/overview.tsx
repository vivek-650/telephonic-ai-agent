'use client';
// What the AI concluded and why: verdict, the 100-point breakdown, evidence, flags and the LLM analysis.
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertOctagon, Check, Minus, Quote, Sparkles, TrendingDown, TrendingUp, Wand2 } from 'lucide-react';
import { post } from '@/lib/api';
import type { CandidateDetail, CandidateSuite } from '@/lib/types';
import { cn, fmtRelative, scoreTone, titleCase } from '@/lib/utils';
import { Badge, Card, CardBody, CardHeader, EmptyState, Meter } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

export function ScoreBreakdown({ c }: { c: CandidateDetail }) {
  if (!c.score) return null;
  return (
    <Card>
      <CardHeader title="Score breakdown" description="Deterministic rubric. Every point has a reason; knockouts force a reject." />
      <CardBody className="space-y-3.5">
        {c.score.breakdown.map(b => {
          const pct = (b.points / (b.max || 1)) * 100;
          return (
            <div key={b.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-medium">{b.label}</span>
                <span className="font-mono text-[12px] tabular-nums text-muted"><span className="text-fg">{b.points}</span> / {b.max}</span>
              </div>
              <Meter value={b.points} max={b.max} tone={pct >= 80 ? 'success' : pct >= 45 ? 'warning' : 'danger'} />
              <p className="mt-1 text-[12px] text-muted">{b.note}</p>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

export function Verdict({ c }: { c: CandidateDetail }) {
  const e = c.evaluation;
  const flags = c.score?.flags || [];
  const screened = c.screenings.some(s => s.status === 'completed');
  return (
    <Card>
      <CardHeader title="AI verdict" description={screened ? 'From the interview, the application form and the resume' : 'Form only. The verdict firms up after the AI interview.'} />
      <CardBody className="space-y-4">
        {e.blocker && (
          <div className="flex gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            <AlertOctagon className="mt-0.5 size-4 shrink-0" /><div><b className="font-semibold">Why they can’t be hired as things stand.</b> {e.blocker}</div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Strengths</p>
            <ul className="space-y-1.5">{e.pros.length ? e.pros.map(p => <li key={p} className="flex gap-2 text-[13px]"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />{p}</li>) : <li className="text-[13px] text-subtle">None yet</li>}</ul>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Concerns</p>
            <ul className="space-y-1.5">{e.cons.length ? e.cons.map(p => <li key={p} className="flex gap-2 text-[13px]"><Minus className="mt-0.5 size-3.5 shrink-0 text-danger" />{p}</li>) : <li className="text-[13px] text-subtle">None</li>}</ul>
          </div>
        </div>
        {e.outliers.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Compared with other applicants for this role</p>
            <div className="flex flex-wrap gap-1.5">{e.outliers.map(o => <Badge key={o.text} tone={o.good ? 'success' : 'warning'}>{o.good ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{o.text}</Badge>)}</div>
          </div>
        )}
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">{flags.map(f => <Badge key={f.text} tone={f.level === 'red' ? 'danger' : f.level === 'good' ? 'success' : 'warning'} dot>{f.text}</Badge>)}</div>
        )}
        {c.highlights?.proof?.length ? (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Evidence they gave</p>
            <div className="space-y-2">{c.highlights.proof.map(p => <blockquote key={p} className="flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]"><Quote className="mt-0.5 size-3.5 shrink-0 text-subtle" />{p}</blockquote>)}</div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

const NEXT: Record<string, { tone: 'success' | 'warning' | 'danger'; label: string }> = { advance: { tone: 'success', label: 'Advance' }, hold: { tone: 'warning', label: 'Hold' }, reject: { tone: 'danger', label: 'Reject' } };

export function AiAnalysis({ id, suite, onChange }: { id: string; suite?: CandidateSuite; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const a = suite?.analysis;
  const run = async () => {
    setBusy(true);
    try { await post(`/api/candidates/${id}/analyze`); toast.success('Analysis updated'); onChange(); } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-accent" />AI analysis</span>}
        description="A second opinion from the LLM, constrained to job-related evidence. It suggests; you decide."
        action={<Button size="sm" onClick={run} loading={busy}><Wand2 className="size-3.5" />{a ? 'Re-run' : 'Analyze'}</Button>} />
      <CardBody>
        {!a ? <EmptyState title="Not analysed yet" description="Runs automatically after each interview when auto-analysis is on." className="py-6" /> : (
          <div className="space-y-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={NEXT[a.next_step]?.tone}>Suggests: {NEXT[a.next_step]?.label || titleCase(a.next_step)}</Badge>
              <Badge>Confidence {Math.round((a.confidence || 0) * 100)}%</Badge>
              <Badge>{a.provider === 'rules' ? 'Rules fallback' : a.provider}</Badge>
              <span className="text-[12px] text-subtle">{fmtRelative(a.at)}</span>
            </div>
            <p className="leading-relaxed">{a.summary}</p>
            {a.red_flags?.length > 0 && <p className="text-danger">Red flags: {a.red_flags.join('; ')}</p>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function HireSignal({ suite }: { suite?: CandidateSuite }) {
  const s = suite?.signal;
  if (!s) return null;
  return (
    <Card>
      <CardHeader title="Hire signal" description="AI screen 40%, interviews 40%, references 20%" />
      <CardBody className="space-y-3">
        <div className="flex items-baseline gap-2"><span className={cn('text-[28px] font-semibold tabular-nums', s.signal == null && 'text-subtle')}>{s.signal ?? '—'}</span><Badge tone={scoreTone(s.signal)}>{s.band}</Badge></div>
        {s.parts.map(p => (
          <div key={p.label}><div className="mb-1 flex justify-between text-[12px] text-muted"><span>{p.label}</span><span className="font-mono tabular-nums">{Math.round(p.value)}</span></div><Meter value={p.value} tone={scoreTone(p.value)} /></div>
        ))}
        {s.veto && <p className="text-[12px] text-danger">A strong-no recommendation vetoes the signal.</p>}
      </CardBody>
    </Card>
  );
}
