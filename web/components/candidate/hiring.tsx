'use client';
// Everything after the AI screen: human interviews and scorecards, references, offers, onboarding and messages.
import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, CheckCircle2, Circle, ClipboardCheck, FileSignature, MessageCircle, Phone, Plus, Send, UserCheck, Video } from 'lucide-react';
import { post } from '@/lib/api';
import type { CandidateDetail, CandidateSuite } from '@/lib/types';
import { cn, fmtDate, fmtDateTime, fmtMoney, titleCase } from '@/lib/utils';
import { useRecruiterId } from '@/lib/recruiter';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';

type P = { c: CandidateDetail; suite: CandidateSuite; onChange: () => void };
const run = async (fn: () => Promise<unknown>, ok: string, done: () => void) => {
  try { await fn(); toast.success(ok); done(); } catch (e: any) { toast.error(e.message); }
};

function Scorecard({ interviewId, dims, onDone }: { interviewId: string; dims: string[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [recruiter] = useRecruiterId();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [rec, setRec] = useState('yes');
  const [notes, setNotes] = useState('');
  const submit = () => run(() => post(`/api/interviews/${interviewId}/scorecard`, { recruiter_id: recruiter, ratings, recommendation: rec, notes }), 'Scorecard saved', () => { setOpen(false); onDone(); });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><ClipboardCheck className="size-3.5" />Scorecard</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Interview scorecard" description="Rate each dimension 1 to 5. Structured ratings keep interviews comparable and fair."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={submit} disabled={dims.some(d => !ratings[d])}>Save scorecard</Button></>}>
        <div className="space-y-4">
          {dims.map(d => (
            <div key={d} className="flex items-center justify-between gap-4">
              <span className="text-[13px] font-medium">{titleCase(d)}</span>
              <div className="flex gap-1" role="radiogroup" aria-label={titleCase(d)}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} role="radio" aria-checked={ratings[d] === n} onClick={() => setRatings(r => ({ ...r, [d]: n }))}
                    className={cn('size-8 rounded-lg border text-[13px] font-medium tabular-nums', ratings[d] === n ? 'border-fg bg-fg text-bg' : 'border-border hover:bg-surface-2')}>{n}</button>
                ))}
              </div>
            </div>
          ))}
          <Field label="Recommendation">{id => <Select id={id} value={rec} onChange={e => setRec(e.target.value)}>{['strong_yes', 'yes', 'no', 'strong_no'].map(r => <option key={r} value={r}>{titleCase(r)}</option>)}</Select>}</Field>
          <Field label="Notes">{id => <Textarea id={id} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Evidence for your ratings" />}</Field>
        </div>
      </Dialog>
    </>
  );
}

export function HumanInterviews({ c, suite, onChange }: P) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState('');
  const [recruiter] = useRecruiterId();
  const book = () => run(() => post(`/api/candidates/${c.id}/interviews`, { starts_at: new Date(when).toISOString(), recruiter_id: recruiter || undefined }), 'Interview scheduled', () => { setOpen(false); onChange(); });
  const status = (id: string, s: string) => run(() => post(`/api/interviews/${id}/status`, { status: s }), `Marked ${titleCase(s)}`, onChange);
  return (
    <Card>
      <CardHeader title="Interviews" description="Human interviews, booked by the recruiter or by the candidate from their link"
        action={<div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(`${location.origin}/book?c=${c.id}`); toast.success('Booking link copied'); }}>Copy booking link</Button>
          <Button size="sm" onClick={() => setOpen(true)}><CalendarPlus className="size-3.5" />Schedule</Button>
        </div>} />
      <div className="divide-y divide-border border-t border-border">
        {!suite.interviews.length && <EmptyState title="No interviews scheduled" className="py-8" />}
        {suite.interviews.map(i => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Video className="size-4 text-subtle" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{fmtDateTime(i.starts_at)} <span className="font-normal text-muted">· {i.duration_min} min{i.recruiter_name ? ` · ${i.recruiter_name}` : ''}</span></p>
              {i.scorecards.map((s, k) => <p key={k} className="text-[12px] text-muted">{s.recruiter_name}: {titleCase(s.recommendation)} · avg {(Object.values(s.ratings).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(s.ratings).length)).toFixed(1)}/5</p>)}
            </div>
            <Badge tone={i.status === 'scheduled' ? 'accent' : i.status === 'completed' ? 'success' : 'warning'}>{titleCase(i.status)}</Badge>
            {i.meet_link && <a className="text-[12.5px] text-accent hover:underline" href={i.meet_link} target="_blank" rel="noreferrer">Join</a>}
            {i.status === 'scheduled' && <><Button size="sm" variant="ghost" onClick={() => status(i.id, 'no_show')}>No-show</Button><Button size="sm" variant="ghost" onClick={() => status(i.id, 'cancelled')}>Cancel</Button></>}
            {i.status !== 'cancelled' && <Scorecard interviewId={i.id} dims={suite.dimensions} onDone={onChange} />}
          </div>
        ))}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Schedule an interview" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={book} disabled={!when}>Schedule</Button></>}>
        <Field label="Date and time" help="Your local time. The candidate gets a confirmation message draft.">{id => <Input id={id} type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />}</Field>
      </Dialog>
    </Card>
  );
}

export function References({ c, suite, onChange }: P) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', relation: '', company: '' });
  const add = () => run(() => post(`/api/candidates/${c.id}/references`, f), 'Reference added', () => { setOpen(false); setF({ name: '', phone: '', relation: '', company: '' }); onChange(); });
  return (
    <Card>
      <CardHeader title="References" description="The AI can phone a reference, or you can enter what they said" action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="size-3.5" />Add</Button>} />
      <div className="divide-y divide-border border-t border-border">
        {!suite.references.length && <EmptyState title="No references yet" className="py-8" />}
        {suite.references.map(r => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <UserCheck className="size-4 text-subtle" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{r.name} <span className="font-normal text-muted">· {[r.relation, r.company].filter(Boolean).join(', ')}</span></p>
              {r.answers && <p className="text-[12px] text-muted">Rating {r.answers.rating}/5 · {r.answers.rehire ? 'Would rehire' : 'Would not rehire'}{r.answers.strengths ? ` · ${r.answers.strengths}` : ''}</p>}
            </div>
            <Badge tone={r.status === 'completed' ? 'success' : r.status === 'calling' ? 'accent' : 'neutral'}>{titleCase(r.status)}</Badge>
            {r.status === 'pending' && <Button size="sm" onClick={() => run(() => post(`/api/references/${r.id}/call`), 'Reference call started', onChange)}><Phone className="size-3.5" />AI call</Button>}
          </div>
        ))}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a reference" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={add} disabled={!f.name || !f.phone}>Add reference</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['name', 'phone', 'relation', 'company'] as const).map(k => <Field key={k} label={titleCase(k)} required={k === 'name' || k === 'phone'}>{id => <Input id={id} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder={k === 'relation' ? 'Former manager' : ''} />}</Field>)}
        </div>
      </Dialog>
    </Card>
  );
}

const OFFER_NEXT: Record<string, string[]> = { draft: ['sent'], sent: ['accepted', 'declined', 'negotiating'], negotiating: ['sent', 'accepted', 'declined'] };

export function Offers({ c, suite, onChange }: P) {
  const [open, setOpen] = useState(false);
  const [salary, setSalary] = useState(String(c.expected_salary || c.job?.max_salary || ''));
  const [date, setDate] = useState('');
  const [view, setView] = useState<string | null>(null);
  const create = () => run(() => post(`/api/candidates/${c.id}/offers`, { salary: Number(salary), joining_date: date }), 'Offer drafted', () => { setOpen(false); onChange(); });
  return (
    <Card>
      <CardHeader title="Offer" description="Drafted from the role and the negotiated salary; warns when it is over budget"
        action={!suite.offers.some(o => ['draft', 'sent', 'negotiating', 'accepted'].includes(o.status)) && <Button size="sm" onClick={() => setOpen(true)}><FileSignature className="size-3.5" />Draft offer</Button>} />
      <div className="divide-y divide-border border-t border-border">
        {!suite.offers.length && <EmptyState title="No offer yet" className="py-8" />}
        {suite.offers.map(o => (
          <div key={o.id} className="space-y-2 px-5 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-[13px] font-medium">{fmtMoney(o.salary)} / month <span className="font-normal text-muted">· joins {fmtDate(o.joining_date)}</span></p>
              <Badge tone={o.status === 'accepted' ? 'success' : o.status === 'declined' ? 'danger' : 'accent'}>{titleCase(o.status)}</Badge>
              <Button size="sm" variant="ghost" onClick={() => setView(o.letter)}>View letter</Button>
              {(OFFER_NEXT[o.status] || []).map(s => <Button key={s} size="sm" variant={s === 'accepted' ? 'primary' : 'secondary'} onClick={() => run(() => post(`/api/offers/${o.id}/status`, { status: s }), `Offer ${s}`, onChange)}>{s === 'sent' ? 'Mark sent' : titleCase(s)}</Button>)}
            </div>
            {o.warning && <p className="text-[12px] text-warning">{o.warning}</p>}
          </div>
        ))}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Draft an offer" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={create} disabled={!salary || !date}>Create draft</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monthly salary (₹)" help={c.job?.max_salary ? `Role budget ${fmtMoney(c.job.max_salary)}` : undefined}>{id => <Input id={id} type="number" value={salary} onChange={e => setSalary(e.target.value)} />}</Field>
          <Field label="Joining date">{id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
        </div>
      </Dialog>
      <Dialog open={!!view} onClose={() => setView(null)} title="Offer letter"><pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap">{view}</pre></Dialog>
    </Card>
  );
}

export function Onboarding({ suite, onChange }: Omit<P, 'c'>) {
  if (!suite.onboarding.length) return null;
  const done = suite.onboarding.filter(o => o.status === 'done').length;
  return (
    <Card>
      <CardHeader title="Onboarding" description={`${done} of ${suite.onboarding.length} done`} />
      <ul className="divide-y divide-border border-t border-border">
        {suite.onboarding.map(o => (
          <li key={o.id}>
            <button onClick={() => run(() => post(`/api/onboarding/${o.id}/toggle`), 'Updated', onChange)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-[13px] hover:bg-surface-2/60">
              {o.status === 'done' ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-subtle" />}
              <span className={cn('flex-1', o.status === 'done' && 'text-muted line-through')}>{o.title}</span>
              <span className="text-[12px] text-subtle">{fmtDate(o.due)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const KINDS = ['shortlist', 'interview_confirm', 'reminder', 'followup', 'offer', 'docs', 'joining', 'reject'];

export function Messages({ c, suite, onChange }: P) {
  const [kind, setKind] = useState('shortlist');
  const [busy, setBusy] = useState(false);
  const draft = async () => { setBusy(true); await run(() => post(`/api/candidates/${c.id}/messages/draft`, { kind, channel: 'whatsapp' }), 'Draft ready', onChange); setBusy(false); };
  const wa = (body: string) => `https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(body)}`;
  return (
    <Card>
      <CardHeader title="Messages" description="AI-drafted candidate messages. Nothing is sent without you."
        action={<div className="flex gap-2"><Select value={kind} onChange={e => setKind(e.target.value)} className="h-7 w-auto text-[12.5px]">{KINDS.map(k => <option key={k} value={k}>{titleCase(k)}</option>)}</Select><Button size="sm" onClick={draft} loading={busy}><MessageCircle className="size-3.5" />Draft</Button></div>} />
      <div className="divide-y divide-border border-t border-border">
        {!suite.messages.length && <EmptyState title="No messages yet" className="py-8" />}
        {suite.messages.map(m => (
          <div key={m.id} className="space-y-2 px-5 py-3">
            <div className="flex items-center gap-2"><Badge>{titleCase(m.kind)}</Badge><Badge tone={m.status === 'sent' ? 'success' : m.status === 'draft' ? 'accent' : 'neutral'}>{titleCase(m.status)}</Badge><span className="ml-auto text-[12px] text-subtle">{fmtDateTime(m.created_at)}</span></div>
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{m.body}</p>
            {m.status === 'draft' && (
              <div className="flex gap-2">
                <a href={wa(m.body)} target="_blank" rel="noreferrer" onClick={() => post(`/api/messages/${m.id}/status`, { status: 'sent' }).then(onChange)} className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 text-[12.5px] font-medium text-white"><Send className="size-3" />Send on WhatsApp</a>
                <Button size="sm" variant="ghost" onClick={() => run(() => post(`/api/messages/${m.id}/status`, { status: 'skipped' }), 'Skipped', onChange)}>Skip</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
