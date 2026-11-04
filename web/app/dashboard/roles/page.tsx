'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Briefcase, Copy, MapPin, Pencil, Plus, Sparkles, Users, Wand2 } from 'lucide-react';
import { post, put, useApi } from '@/lib/api';
import type { CandidateRow, Config, Job } from '@/lib/types';
import { fmtLpa, fmtMoney, titleCase } from '@/lib/utils';
import { Badge, Card, CardBody, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';

type Voices = { supported: boolean; voices: { id: string; gender: string; style: string }[]; note: string };
type Draft = Partial<Job> & { locations_text?: string; skills_text?: string; questions_text?: string };

const toDraft = (j?: Job): Draft => j ? { ...j, locations_text: (j.locations || []).join(', '), skills_text: (j.must_skills || []).join(', '), questions_text: (j.custom_questions || []).join('\n') }
  : { title: '', location: '', min_years: 2, max_salary: 60000, max_notice_days: 30, headcount: 1, description: '', status: 'open', negotiable: 0, stretch_pct: 10, locations_text: '', skills_text: '', questions_text: '' };

function RoleEditor({ job, open, onClose, onSaved }: { job?: Job; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(toDraft(job));
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const { data: voices } = useApi<Voices>(open ? '/api/voices' : null);
  const set = (k: keyof Draft, v: unknown) => setD(x => ({ ...x, [k]: v }));

  const aiDraft = async () => {
    if (!d.title) return toast.error('Add a title first');
    setDrafting(true);
    try {
      const g = await post<Partial<Job> & { must_skills?: string[] }>('/api/jobs/generate', { title: d.title, location: d.location, notes: d.description });
      setD(x => ({ ...x, description: g.description || x.description, skills_text: g.must_skills?.length ? g.must_skills.join(', ') : x.skills_text, min_years: g.min_years ?? x.min_years, max_salary: g.max_salary ?? x.max_salary }));
      toast.success('Draft filled in. Review before saving.');
    } catch (e: any) { toast.error(e.message); }
    setDrafting(false);
  };

  const save = async () => {
    setBusy(true);
    const body = { title: d.title, company: d.company, location: d.location, min_years: d.min_years, max_salary: d.max_salary, max_notice_days: d.max_notice_days, headcount: d.headcount, description: d.description, status: d.status,
      locations: d.locations_text, must_skills: d.skills_text, custom_questions: (d.questions_text || '').split('\n').map(s => s.trim()).filter(Boolean),
      negotiable: !!d.negotiable, stretch_pct: d.stretch_pct, negotiation_notes: d.negotiation_notes, voice: d.voice || '', agent_name: d.agent_name || '' };
    try {
      if (job) await put(`/api/jobs/${job.id}`, body); else await post('/api/jobs', body);
      toast.success(job ? 'Role updated' : 'Role created'); onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };

  const num = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value === '' ? '' : Number(e.target.value));
  return (
    <Dialog open={open} onClose={onClose} title={job ? `Edit ${job.title}` : 'New role'} description="What the AI interviewer and the scoring rubric use for this role." className="w-[min(720px,calc(100vw-32px))]"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy} disabled={!d.title}>{job ? 'Save changes' : 'Create role'}</Button></>}>
      <div className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2">{id => <div className="flex gap-2"><Input id={id} value={d.title} onChange={e => set('title', e.target.value)} placeholder="Inside Sales Executive" /><Button onClick={aiDraft} loading={drafting} title="Draft the description and requirements with AI"><Wand2 className="size-3.5" />AI draft</Button></div>}</Field>
          <Field label="Location shown to applicants">{id => <Input id={id} value={d.location} onChange={e => set('location', e.target.value)} placeholder="Pune (on-site)" />}</Field>
          <Field label="Accepted cities" help="Comma separated. Anyone else is asked about relocating.">{id => <Input id={id} value={d.locations_text} onChange={e => set('locations_text', e.target.value)} placeholder="pune, mumbai" />}</Field>
          <Field label="Description" className="sm:col-span-2">{id => <Textarea id={id} value={d.description} onChange={e => set('description', e.target.value)} className="min-h-24" />}</Field>
        </section>
        <section>
          <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-muted uppercase">Requirements</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Min. years">{id => <Input id={id} type="number" min={0} value={d.min_years ?? ''} onChange={num('min_years')} />}</Field>
            <Field label="Budget ₹/month" help={d.max_salary ? fmtLpa(Number(d.max_salary)) : undefined}>{id => <Input id={id} type="number" min={0} value={d.max_salary ?? ''} onChange={num('max_salary')} />}</Field>
            <Field label="Max notice (days)">{id => <Input id={id} type="number" min={0} value={d.max_notice_days ?? ''} onChange={num('max_notice_days')} />}</Field>
            <Field label="Openings">{id => <Input id={id} type="number" min={1} value={d.headcount ?? ''} onChange={num('headcount')} />}</Field>
            <Field label="Must-have skills" help="Matched on whole words in the form, resume and interview." className="sm:col-span-4">{id => <Input id={id} value={d.skills_text} onChange={e => set('skills_text', e.target.value)} placeholder="crm, cold calling, english" />}</Field>
            <Field label="Extra interview questions" help="One per line. The AI asks them in its own words." className="sm:col-span-4">{id => <Textarea id={id} value={d.questions_text} onChange={e => set('questions_text', e.target.value)} />}</Field>
          </div>
        </section>
        <section className="space-y-3 rounded-xl border border-border p-4">
          <Switch checked={!!d.negotiable} onChange={v => set('negotiable', v ? 1 : 0)} label="Salary negotiation" description="The AI states the budget and may make one capped counter. It never promises an offer." />
          {!!d.negotiable && (
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              <Field label="Stretch %" help={d.max_salary ? `Up to ${fmtMoney(Number(d.max_salary) * (1 + Number(d.stretch_pct || 0) / 100))}` : undefined}>{id => <Input id={id} type="number" min={0} max={50} value={d.stretch_pct ?? 10} onChange={num('stretch_pct')} />}</Field>
              <Field label="Why the budget is tight" help="The AI uses this to explain the number honestly.">{id => <Input id={id} value={d.negotiation_notes || ''} onChange={e => set('negotiation_notes', e.target.value)} placeholder="The project budget is fixed for this year" />}</Field>
            </div>
          )}
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="AI interviewer name" help="Leave empty to use the default.">{id => <Input id={id} value={d.agent_name || ''} onChange={e => set('agent_name', e.target.value)} placeholder="Priya" />}</Field>
          <Field label="AI voice" help={voices && !voices.supported ? voices.note : 'A dedicated voice agent is built for this role automatically.'}>
            {id => <Select id={id} value={d.voice || ''} onChange={e => set('voice', e.target.value)} disabled={!voices?.supported}><option value="">Default voice</option>{voices?.voices.map(v => <option key={v.id} value={v.id}>{v.id} · {v.gender}, {v.style}</option>)}</Select>}
          </Field>
          {job && <Field label="Status">{id => <Select id={id} value={d.status} onChange={e => set('status', e.target.value)}><option value="open">Open</option><option value="paused">Paused</option><option value="closed">Closed</option></Select>}</Field>}
        </section>
      </div>
    </Dialog>
  );
}

function Matches({ job, onClose }: { job: Job; onClose: () => void }) {
  const { data, mutate } = useApi<{ id: string; name: string; city: string; from_job: string; total: number; verdict: string; consent: boolean }[]>(`/api/jobs/${job.id}/matches`);
  const add = async (cid: string) => { try { await post(`/api/jobs/${job.id}/matches/${cid}/apply`); toast.success('Added to this role with a follow-up message draft'); mutate(); } catch (e: any) { toast.error(e.message); } };
  return (
    <Dialog open onClose={onClose} title={`Talent pool for ${job.title}`} description="Past applicants who would score 50+ for this role, without a knockout.">
      {!data ? <Skeleton className="h-32" /> : !data.length ? <EmptyState icon={Users} title="No strong matches in the talent pool" /> : (
        <ul className="divide-y divide-border">{data.map(m => (
          <li key={m.id} className="flex items-center gap-3 py-2.5 text-[13px]">
            <div className="flex-1"><p className="font-medium">{m.name}</p><p className="text-[12px] text-muted">{m.city} · applied for {m.from_job}</p></div>
            <Badge tone={m.total >= 75 ? 'success' : 'warning'}>{m.total}</Badge>
            <Button size="sm" disabled={!m.consent} title={m.consent ? '' : 'No consent to be contacted about other roles'} onClick={() => add(m.id)}>Add</Button>
          </li>))}
        </ul>
      )}
    </Dialog>
  );
}

export default function RolesPage() {
  const { data, mutate } = useApi<Job[]>('/api/jobs');
  const { data: cands } = useApi<CandidateRow[]>('/api/candidates', 20000);
  const { data: cfg } = useApi<Config>('/api/config');
  const [editing, setEditing] = useState<Job | 'new' | null>(null);
  const [matching, setMatching] = useState<Job | null>(null);
  const copy = (j: Job) => { navigator.clipboard.writeText(`${cfg?.careers_url || location.origin}/apply/${j.id}`); toast.success('Apply link copied'); };

  return (
    <>
      <PageHeader title="Roles" description="Each role has its own apply link, rubric, negotiation rules and AI interviewer."
        actions={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-3.5" />New role</Button>} />
      {!data ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-52 rounded-xl" /><Skeleton className="h-52 rounded-xl" /></div>
        : !data.length ? <Card><EmptyState icon={Briefcase} title="No roles yet" description="Create a role, then share its apply link. Every applicant gets an AI interview." action={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-3.5" />New role</Button>} /></Card>
        : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.map(j => {
              const cs = (cands || []).filter(c => c.job_id === j.id);
              return (
                <Card key={j.id} className="flex flex-col">
                  <CardBody className="flex-1 pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold tracking-tight">{j.title}</h3>
                        <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted"><MapPin className="size-3" />{j.location || 'Location not set'}</p>
                      </div>
                      <Badge tone={j.status === 'closed' ? 'neutral' : j.status === 'paused' ? 'warning' : 'success'} dot>{titleCase(j.status || 'open')}</Badge>
                    </div>
                    <p className="mt-3 line-clamp-2 text-[13px] text-muted">{j.description}</p>
                    <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-surface-2/60 p-3 text-[12px]">
                      <div><p className="text-muted">Budget</p><p className="font-medium tabular-nums">{fmtMoney(j.max_salary)}</p></div>
                      <div><p className="text-muted">Experience</p><p className="font-medium">{j.min_years}+ yrs</p></div>
                      <div><p className="text-muted">Applicants</p><p className="font-medium tabular-nums">{cs.length} <span className="text-subtle">· {cs.filter(c => c.verdict === 'Strong').length} strong</span></p></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(j.must_skills || []).map(s => <Badge key={s}>{s}</Badge>)}
                      {!!j.negotiable && <Badge tone="accent">Negotiates up to +{j.stretch_pct}%</Badge>}
                      {j.voice && <Badge tone="accent"><Sparkles className="size-3" />{j.agent_name || 'AI'} · {j.voice}</Badge>}
                    </div>
                  </CardBody>
                  <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
                    <Button size="sm" onClick={() => copy(j)}><Copy className="size-3.5" />Copy apply link</Button>
                    <Button size="sm" variant="ghost" onClick={() => setMatching(j)}><Users className="size-3.5" />Talent pool</Button>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(j)}><Pencil className="size-3.5" />Edit</Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      {editing && <RoleEditor key={editing === 'new' ? 'new' : editing.id} job={editing === 'new' ? undefined : editing} open onClose={() => setEditing(null)} onSaved={() => mutate()} />}
      {matching && <Matches job={matching} onClose={() => setMatching(null)} />}
    </>
  );
}
