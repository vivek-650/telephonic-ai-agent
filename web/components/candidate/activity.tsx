'use client';
// Timeline, recruiter notes, the AI decision audit trail, AI feedback and the rejection flow.
import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { History, Mail, PhoneOutgoing, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { CandidateDetail } from '@/lib/types';
import { cn, fmtDateTime, fmtRelative, titleCase, verdictTone } from '@/lib/utils';
import { useRecruiterId } from '@/lib/recruiter';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';

export function Timeline({ c, onChange }: { c: CandidateDetail; onChange: () => void }) {
  const [recruiter] = useRecruiterId();
  const [kind, setKind] = useState('note');
  const [text, setText] = useState('');
  const [rating, setRating] = useState('4');
  const add = async () => {
    try {
      await post(`/api/candidates/${c.id}/activities`, { recruiter_id: recruiter, kind, text, rating: kind === 'interview' ? Number(rating) : null });
      setText(''); toast.success('Logged'); onChange();
    } catch (e: any) { toast.error(e.message); }
  };
  const items = [
    ...c.events.map(e => ({ at: e.at, who: 'System', kind: e.kind, text: e.detail })),
    ...c.activities.filter(a => a.kind === 'note' || a.kind === 'call').map(a => ({ at: a.created_at, who: a.recruiter_name || 'Recruiter', kind: a.kind, text: a.text })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card>
      <CardHeader title="Activity" description="Everything that happened, newest first" />
      <CardBody className="space-y-5">
        <div className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-3">
          <div className="flex gap-2">
            <Select value={kind} onChange={e => setKind(e.target.value)} className="h-8 w-auto text-[12.5px]"><option value="note">Note</option><option value="call">Call log</option><option value="interview">Interview rating</option></Select>
            {kind === 'interview' && <Select value={rating} onChange={e => setRating(e.target.value)} className="h-8 w-auto text-[12.5px]">{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}</Select>}
          </div>
          <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add a note for the team…" className="min-h-16 bg-surface" />
          <div className="flex justify-end"><Button size="sm" variant="primary" onClick={add} disabled={!recruiter || (!text.trim() && kind !== 'interview')}>Log</Button></div>
        </div>
        <ol className="relative space-y-4 border-l border-border pl-5">
          {items.map((it, i) => (
            <li key={i} className="relative">
              <span className={cn('absolute top-1.5 -left-[24.5px] size-2 rounded-full ring-4 ring-surface', it.who === 'System' ? 'bg-border-strong' : 'bg-accent')} />
              <p className="text-[13px]">{it.text}</p>
              <p className="text-[11.5px] text-subtle">{it.who} · {titleCase(it.kind)} · {fmtDateTime(it.at)}</p>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

export function ScoreAudit({ c }: { c: CandidateDetail }) {
  if (!c.score_history?.length) return null;
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-1.5"><History className="size-3.5" />Decision audit trail</span>} description="Every automated score with the rubric version that produced it" />
      <ul className="divide-y divide-border border-t border-border text-[12.5px]">
        {c.score_history.map((h, i) => (
          <li key={i} className="flex items-center gap-3 px-5 py-2">
            <span className="w-8 font-mono font-medium tabular-nums">{h.total}</span>
            <Badge tone={verdictTone(h.verdict)}>{h.verdict}</Badge>
            <span className="text-muted">{titleCase(h.trigger.replace(':', ' '))}</span>
            <span className="ml-auto font-mono text-[11.5px] text-subtle">v{h.rubric_version} · {fmtRelative(h.created_at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AiFeedback({ c, onChange }: { c: CandidateDetail; onChange: () => void }) {
  const [recruiter] = useRecruiterId();
  const [note, setNote] = useState('');
  const last = c.feedback[0];
  const send = async (helpful: boolean) => {
    try { await post(`/api/candidates/${c.id}/feedback`, { helpful, note, recruiter_id: recruiter || undefined }); setNote(''); toast.success('Thanks, this tunes the AI agreement rate'); onChange(); } catch (e: any) { toast.error(e.message); }
  };
  return (
    <Card>
      <CardHeader title="Was the AI right?" description="Your review is the ground truth for how well the AI screens" />
      <CardBody className="space-y-3">
        {last && <p className="text-[12.5px] text-muted">Last review: <b className={last.helpful ? 'text-success' : 'text-danger'}>{last.helpful ? 'helpful' : 'not helpful'}</b> {fmtRelative(last.created_at)}{last.note ? `, “${last.note}”` : ''}</p>}
        <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional: what did it get wrong?" />
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => send(true)}><ThumbsUp className="size-3.5" />Helpful</Button>
          <Button onClick={() => send(false)}><ThumbsDown className="size-3.5" />Not helpful</Button>
        </div>
      </CardBody>
    </Card>
  );
}

type Draft = { to: string; subject: string; text: string; configured: boolean; allowed: boolean; sent_at: string | null };

export function Rejection({ c, onChange }: { c: CandidateDetail; onChange: () => void }) {
  const { data: d, mutate } = useSWR<Draft>(c.stage === 'rejected' ? `/api/candidates/${c.id}/rejection-email` : null, (p: string) => api<Draft>(p));
  const [subject, setSubject] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState<'mail' | 'call' | null>(null);
  if (c.stage !== 'rejected') return null;
  const mail = async () => {
    setBusy('mail');
    try { await post(`/api/candidates/${c.id}/rejection-email`, { confirm: true, resend: !!d?.sent_at, subject: subject ?? d?.subject, text: text ?? d?.text }); toast.success(`Email sent to ${d?.to}`); mutate(); onChange(); } catch (e: any) { toast.error(e.message); }
    setBusy(null);
  };
  const call = async () => {
    if (!confirm(`Have the AI phone ${c.name} to share the decision?`)) return;
    setBusy('call');
    try { await post(`/api/candidates/${c.id}/rejection-call`, { confirm: true, force: demo }); toast.success('Rejection call started'); onChange(); } catch (e: any) { toast.error(e.message); }
    setBusy(null);
  };
  return (
    <Card>
      <CardHeader title="Share the decision" description="A kind, specific note: the main reason, one real strength, and an offer to keep their details" />
      <CardBody className="space-y-3">
        {!d ? <p className="text-[13px] text-subtle">Preparing draft…</p> : (<>
          <div className="flex flex-wrap gap-1.5 text-[12px]">
            <Badge>To {d.to}</Badge>
            {!d.configured && <Badge tone="warning">Email not set up</Badge>}
            {d.configured && !d.allowed && <Badge tone="warning">Locked by the email allowlist</Badge>}
            {d.sent_at && <Badge tone="success">Sent {fmtRelative(d.sent_at)}</Badge>}
          </div>
          <Field label="Subject">{id => <Input id={id} value={subject ?? d.subject} onChange={e => setSubject(e.target.value)} />}</Field>
          <Field label="Message">{id => <Textarea id={id} value={text ?? d.text} onChange={e => setText(e.target.value)} className="min-h-48" />}</Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={mail} loading={busy === 'mail'} disabled={!d.configured || !d.allowed}><Mail className="size-3.5" />{d.sent_at ? 'Send again' : 'Send email'}</Button>
            <Button onClick={call} loading={busy === 'call'}><PhoneOutgoing className="size-3.5" />Or have the AI call</Button>
            <Checkbox checked={demo} onChange={setDemo} className="ml-auto text-[12px] text-muted">Ignore calling hours (demo)</Checkbox>
          </div>
        </>)}
      </CardBody>
    </Card>
  );
}
