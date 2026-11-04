'use client';
// The AI interviews: transcript as a conversation, what the AI extracted, and the human interview kit.
import { useState } from 'react';
import { toast } from 'sonner';
import { Bot, ListChecks, Mic, PhoneCall, PhoneOutgoing, User } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { CandidateDetail } from '@/lib/types';
import { cn, fmtDateTime, fmtDuration, fmtMoney, titleCase, toDate } from '@/lib/utils';
import type { Screening } from '@/lib/types';
import { Badge, Card, CardBody, CardHeader, DefinitionList, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

const ANSWER_LABELS: Record<string, string> = {
  years_experience: 'Relevant experience', notice_days: 'Notice period', expected_salary: 'Expected salary', relocation_ok: 'Can work from location',
  availability: 'Interview availability', negotiation_outcome: 'Salary negotiation', agreed_salary: 'Agreed salary', skill_example: 'Role example',
};
const fmtAnswer = (k: string, v: unknown) => {
  if (v == null || v === '') return '—';
  if (k === 'expected_salary' || k === 'agreed_salary') return `${fmtMoney(Number(v))} / month`;
  if (k === 'notice_days') return `${v} days`;
  if (k === 'years_experience') return `${v} years`;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return titleCase(String(v));
};

const durationOf = (s: Screening) => s.duration_sec ?? (s.ended_at ? Math.round(((toDate(s.ended_at)?.getTime() ?? 0) - (toDate(s.started_at)?.getTime() ?? 0)) / 1000) : null);

export function Interviews({ c, onChange }: { c: CandidateDetail; onChange: () => void }) {
  const [sel, setSel] = useState(0);
  const [calling, setCalling] = useState(false);
  const s = c.screenings[sel];

  const callNow = async () => {
    setCalling(true);
    try { await post(`/api/candidates/${c.id}/screenings`, { mode: 'phone' }); toast.success('Calling the candidate now'); onChange(); } catch (e: any) { toast.error(e.message); }
    setCalling(false);
  };

  if (!c.screenings.length) return (
    <Card><EmptyState icon={Mic} title="No AI interview yet" description="Candidates are interviewed in the browser right after they apply. You can also have the AI phone them (consent and the call allowlist apply)."
      action={<Button onClick={callNow} loading={calling}><PhoneOutgoing className="size-3.5" />Phone screen now</Button>} /></Card>
  );

  const answers = Object.entries(s.answers || {}).filter(([k]) => k !== 'evidence_text' && k !== 'skill_example');
  return (
    <div className="space-y-4">
      {c.screenings.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {c.screenings.map((x, i) => (
            <button key={x.id} onClick={() => setSel(i)} className={cn('rounded-lg border px-3 py-1.5 text-[12.5px]', i === sel ? 'border-fg bg-surface font-medium' : 'border-border text-muted hover:text-fg')}>
              {titleCase(x.mode)} · {fmtDateTime(x.started_at)}
            </button>
          ))}
        </div>
      )}
      <Card>
        <CardHeader title={<span className="flex items-center gap-2">{s.mode === 'phone' ? <PhoneCall className="size-3.5" /> : <Mic className="size-3.5" />}{titleCase(s.mode)} interview</span>}
          description={`${fmtDateTime(s.started_at)} · ${fmtDuration(durationOf(s))}${s.run_id ? ` · run ${s.run_id}` : ''}`}
          action={<Badge tone={s.status === 'completed' ? 'success' : s.status === 'in_progress' ? 'accent' : 'warning'} dot>{s.status === 'incomplete' ? `Incomplete${s.failure_reason ? ` (${titleCase(s.failure_reason)})` : ''}` : titleCase(s.status)}</Badge>} />
        {answers.length > 0 && <CardBody className="border-b border-border"><DefinitionList items={answers.map(([k, v]) => [ANSWER_LABELS[k] || titleCase(k), fmtAnswer(k, v)])} /></CardBody>}
        <div className="max-h-[560px] space-y-3 overflow-y-auto px-5 py-4">
          {!s.transcript.length && <p className="py-6 text-center text-[13px] text-subtle">{s.status === 'in_progress' ? 'The interview is in progress. The transcript appears when it ends.' : 'No transcript was recorded.'}</p>}
          {s.transcript.map((m, i) => {
            const agent = m.role === 'agent';
            return (
              <div key={i} className={cn('flex gap-2.5', !agent && 'flex-row-reverse')}>
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', agent ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted')}>{agent ? <Bot className="size-3.5" /> : <User className="size-3.5" />}</span>
                <p className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed', agent ? 'rounded-tl-md bg-surface-2' : 'rounded-tr-md bg-fg text-bg')}>{m.text}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function InterviewKit({ id }: { id: string }) {
  const [kit, setKit] = useState<{ questions: { q: string; why: string }[]; provider: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { setBusy(true); try { setKit(await api(`/api/candidates/${id}/kit`)); } catch (e: any) { toast.error(e.message); } setBusy(false); };
  return (
    <Card>
      <CardHeader title="Interview kit" description="Structured questions for the human interview, aimed at the gaps the AI found."
        action={<Button size="sm" onClick={load} loading={busy}><ListChecks className="size-3.5" />{kit ? 'Regenerate' : 'Generate'}</Button>} />
      {kit && (
        <CardBody>
          <ol className="space-y-3">
            {kit.questions.map((q, i) => (
              <li key={i} className="flex gap-3 text-[13px]"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[11px] text-muted">{i + 1}</span><div><p className="font-medium">{q.q}</p><p className="text-[12px] text-muted">{q.why}</p></div></li>
            ))}
          </ol>
        </CardBody>
      )}
    </Card>
  );
}
