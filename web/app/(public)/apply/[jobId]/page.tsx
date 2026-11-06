'use client';
import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Briefcase, FileUp, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { ApiError, api, post, useApi } from '@/lib/api';
import type { Config, Job } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Card, CardBody, Skeleton, EmptyState, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { InterviewStage } from '@/components/interview/interview-stage';

const EMPTY = { name: '', email: '', phone: '', city: '', years: '', notice_days: '', expected_salary: '', skills: '', why: '', resume: '' };
type Form = typeof EMPTY;

export default function ApplyPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const { data: cfg } = useApi<Config>('/api/config');
  const { data: jobs } = useApi<Job[]>('/api/jobs');
  const job = jobs?.find(j => j.id === jobId);
  const [f, setF] = useState<Form>(EMPTY);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ state: 'idle' | 'reading' | 'ok' | 'error'; msg?: string }>({ state: 'idle' });
  const [applied, setApplied] = useState<{ id: string; context: Record<string, string> } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF(x => ({ ...x, [k]: e.target.value })); setErrors(x => ({ ...x, [k]: undefined })); };

  const readPdf = async (fl?: File) => {
    if (!fl) return;
    setPdf({ state: 'reading' });
    try {
      const r = await api<{ text: string }>('/api/resume/pdf', { method: 'POST', raw: await fl.arrayBuffer(), headers: { 'Content-Type': 'application/pdf' } });
      setF(x => ({ ...x, resume: r.text })); setPdf({ state: 'ok', msg: `Read from ${fl.name}. Check the text below.` });
    } catch (e: any) { setPdf({ state: 'error', msg: e.message }); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) return setErrors({ form: 'Please tick the consent box so we can run your interview.' });
    setBusy(true); setErrors({});
    try {
      const source = new URLSearchParams(location.search).get('src') || 'careers';
      const r = await post<{ id: string; context: Record<string, string> }>('/api/applications', { ...f, job_id: jobId, consent: true, source });
      setApplied(r); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const list: string[] = err instanceof ApiError && Array.isArray((err.details as any)?.errors) ? (err.details as any).errors : [];
      const byField: typeof errors = {};
      for (const m of list) { const k = m.split(' ')[0] as keyof Form; if (k in EMPTY) byField[k] = m.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()); }
      setErrors({ ...byField, form: Object.keys(byField).length ? 'Please fix the highlighted fields.' : (err as Error).message });
    }
    setBusy(false);
  };

  if (jobs && !job) return <div className="mx-auto max-w-xl px-5 py-20"><Card><EmptyState icon={Briefcase} title="This role is no longer open" action={<Link href="/careers" className="text-[13px] text-accent">See open roles</Link>} /></Card></div>;

  const input = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { help?: string } = {}) => {
    const { help, className, ...rest } = props;
    return <Field label={label} required={rest.required} error={errors[k]} help={help} className={className}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors[k]} value={f[k]} onChange={set(k)} {...rest} />}</Field>;
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[1fr_1.35fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Link href="/careers" className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg"><ArrowLeft className="size-3.5" />All roles</Link>
        {!job ? <Skeleton className="h-60 rounded-xl" /> : (
          <>
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{job.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted"><span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{job.location || 'Flexible'}</span><span>{job.min_years}+ years</span>{job.company && <span>{job.company}</span>}</p>
            {job.description && <p className="mt-5 text-[14px] leading-relaxed text-muted whitespace-pre-line">{job.description}</p>}
            {!!job.must_skills?.length && <div className="mt-5 flex flex-wrap gap-1.5">{job.must_skills.map(s => <Badge key={s}>{s}</Badge>)}</div>}
            <ol className="mt-8 space-y-3 border-t border-border pt-6 text-[13px]">
              {['Apply with your details and resume', `Talk with ${cfg?.agent_name || 'our AI recruiter'} for about 6 minutes`, 'A person reviews it and gets back to you'].map((s, i) => (
                <li key={s} className={cn('flex items-center gap-3', applied && i === 0 && 'text-muted line-through')}><span className="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-surface font-mono text-[11px]">{i + 1}</span>{s}</li>
              ))}
            </ol>
          </>
        )}
      </aside>

      <div>
        {applied && cfg ? <InterviewStage cfg={cfg} candidateId={applied.id} context={applied.context} /> : (
          <Card>
            <form onSubmit={submit} noValidate>
              <CardBody className="space-y-6 pt-6">
                <div><h2 className="text-[16px] font-semibold tracking-tight">Apply</h2><p className="mt-0.5 text-[13px] text-muted">Takes about two minutes. Your interview starts right after.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {input('name', 'Full name', { required: true, autoComplete: 'name' })}
                  {input('email', 'Email', { required: true, type: 'email', autoComplete: 'email' })}
                  {input('phone', 'Mobile number', { required: true, type: 'tel', autoComplete: 'tel', placeholder: '+91' })}
                  {input('city', 'Current city', { required: true, autoComplete: 'address-level2' })}
                  {input('years', 'Years of experience', { type: 'number', min: 0, step: 0.5, inputMode: 'decimal' })}
                  {input('notice_days', 'Notice period (days)', { type: 'number', min: 0, inputMode: 'numeric' })}
                  {input('expected_salary', 'Expected salary (₹ per month)', { type: 'number', min: 0, inputMode: 'numeric', className: 'sm:col-span-2' })}
                </div>
                {input('skills', 'Key skills', { placeholder: 'e.g. CRM, cold calling, English' })}
                <Field label="Why this role?">{id => <Textarea id={id} value={f.why} onChange={set('why')} placeholder="A line or two is enough" />}</Field>
                <Field label="Resume" help="Upload a PDF or paste the text. The AI uses it to ask about your real experience.">
                  {id => (
                    <div className="space-y-2">
                      <button type="button" onClick={() => file.current?.click()} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border-strong px-4 py-3 text-left text-[13px] hover:bg-surface-2/60">
                        {pdf.state === 'reading' ? <Loader2 className="size-4 animate-spin text-muted" /> : <FileUp className="size-4 text-muted" />}
                        <span className={cn(pdf.state === 'error' ? 'text-danger' : pdf.state === 'ok' ? 'text-success' : 'text-muted')}>{pdf.msg || 'Upload a PDF resume (max 5 MB)'}</span>
                      </button>
                      <input ref={file} type="file" accept="application/pdf" className="hidden" onChange={e => readPdf(e.target.files?.[0])} />
                      <Textarea id={id} value={f.resume} onChange={set('resume')} placeholder="…or paste your resume text" className="min-h-28" />
                    </div>
                  )}
                </Field>
                <div className="rounded-lg bg-surface-2/60 p-3">
                  <Checkbox checked={consent} onChange={v => { setConsent(v); setErrors(x => ({ ...x, form: undefined })); }}>
                    I agree that {job?.company || cfg?.brand || 'the hiring team'} may contact me about this application, record and transcribe the AI interview, and keep my details for future roles until I ask for them to be deleted.
                  </Checkbox>
                </div>
                {errors.form && <p className="text-[13px] text-danger" role="alert">{errors.form}</p>}
                <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>Submit and start my interview</Button>
                <p className="flex items-center justify-center gap-1.5 text-[12px] text-subtle"><ShieldCheck className="size-3.5" />Only the hiring team sees your details</p>
              </CardBody>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
