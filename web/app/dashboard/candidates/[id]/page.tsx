'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Mail, MapPin, Phone, Trash2, FileText } from 'lucide-react';
import { del, post, useApi } from '@/lib/api';
import type { CandidateDetail, CandidateSuite, Stage } from '@/lib/types';
import { STAGES, fmtDate, fmtMoney, maskPhone, titleCase, verdictTone } from '@/lib/utils';
import { useRecruiterId } from '@/lib/recruiter';
import { Avatar, Badge, Card, CardBody, CardHeader, DefinitionList, ScoreRing, Skeleton, Tabs } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { AiAnalysis, HireSignal, ScoreBreakdown, Verdict } from '@/components/candidate/overview';
import { InterviewKit, Interviews } from '@/components/candidate/interview';
import { HumanInterviews, Messages, Offers, Onboarding, References } from '@/components/candidate/hiring';
import { AiFeedback, Rejection, ScoreAudit, Timeline } from '@/components/candidate/activity';

type Tab = 'overview' | 'interview' | 'hiring' | 'activity';

export default function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [recruiter] = useRecruiterId();
  const { data: c, mutate, error } = useApi<CandidateDetail>(`/api/candidates/${id}`, 8000);
  const { data: suite, mutate: mutateSuite } = useApi<CandidateSuite>(`/api/candidates/${id}/suite`, 15000);
  const refresh = () => { mutate(); mutateSuite(); };

  if (error) return <Card className="p-10 text-center text-[13px] text-muted">{error.message} · <Link className="text-accent" href="/dashboard/candidates">Back to candidates</Link></Card>;
  if (!c) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-96 rounded-xl lg:col-span-2" /><Skeleton className="h-96 rounded-xl" /></div></div>;

  const moveTo = async (stage: Stage) => {
    try { await post(`/api/candidates/${id}/stage`, { stage, recruiter_id: recruiter || undefined }); toast.success(`Moved to ${titleCase(stage)}`); refresh(); } catch (e: any) { toast.error(e.message); }
  };
  const erase = async () => {
    if (!confirm(`Permanently delete ${c.name} and every record about them? This cannot be undone.`)) return;
    try { await del(`/api/candidates/${id}`); toast.success('Candidate data erased'); router.replace('/dashboard/candidates'); } catch (e: any) { toast.error(e.message); }
  };
  const scored = c.score && c.score.verdict !== 'Pending screen';

  return (
    <>
      <Link href="/dashboard/candidates" className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg"><ArrowLeft className="size-3.5" />Candidates</Link>
      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={c.name} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-tight">{c.name}</h1>
              {c.score && <Badge tone={verdictTone(c.score.verdict)}>{c.score.verdict}</Badge>}
              {suite?.spot_check && <Badge tone="accent">Fairness spot check</Badge>}
            </div>
            <p className="mt-0.5 text-[13px] text-muted">{c.job?.title} · applied {fmtDate(c.created_at)} via {c.source?.replace(/^csv:/, 'import ') || 'careers page'}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{c.city}</span>
              <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-fg"><Mail className="size-3.5" />{c.email}</a>
              <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" />{maskPhone(c.phone)}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right"><p className="text-[11.5px] text-muted">AI score</p><p className="text-[11.5px] text-subtle">{scored ? 'out of 100' : 'after interview'}</p></div>
            <ScoreRing value={scored ? c.score!.total : null} size={60} stroke={5} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="text-[12.5px] text-muted">Stage</span>
          <Select value={c.stage} onChange={e => moveTo(e.target.value as Stage)} className="h-8 w-auto text-[13px]">{STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
          {c.stage !== 'shortlisted' && c.stage !== 'hired' && <Button size="sm" onClick={() => moveTo('shortlisted')}>Shortlist</Button>}
          {c.stage !== 'rejected' && <Button size="sm" variant="ghost" onClick={() => moveTo('rejected')}>Reject</Button>}
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={erase} className="text-danger hover:bg-danger-soft hover:text-danger"><Trash2 className="size-3.5" />Erase data</Button>
        </div>
      </Card>

      <Tabs value={tab} onChange={setTab} className="mb-5" items={[
        { id: 'overview', label: 'Overview' }, { id: 'interview', label: 'AI interview', count: c.screenings.length },
        { id: 'hiring', label: 'Hiring' }, { id: 'activity', label: 'Activity', count: c.events.length },
      ]} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {tab === 'overview' && <><Rejection c={c} onChange={refresh} /><Verdict c={c} /><AiAnalysis id={id} suite={suite} onChange={refresh} /><ScoreBreakdown c={c} /></>}
          {tab === 'interview' && <><Interviews c={c} onChange={refresh} /><InterviewKit id={id} /></>}
          {tab === 'hiring' && (suite ? <><HumanInterviews c={c} suite={suite} onChange={refresh} /><Offers c={c} suite={suite} onChange={refresh} /><Onboarding suite={suite} onChange={refresh} /><References c={c} suite={suite} onChange={refresh} /><Messages c={c} suite={suite} onChange={refresh} /></> : <Skeleton className="h-64 rounded-xl" />)}
          {tab === 'activity' && <><Timeline c={c} onChange={refresh} /><ScoreAudit c={c} /></>}
        </div>
        <aside className="space-y-4">
          <AiFeedback c={c} onChange={refresh} />
          <HireSignal suite={suite} />
          <Card>
            <CardHeader title="Application" />
            <CardBody>
              <DefinitionList items={[
                ['Experience', c.years != null ? `${c.years} years` : '—'],
                ['Notice period', c.notice_days != null ? `${c.notice_days} days` : '—'],
                ['Expected salary', c.expected_salary != null ? `${fmtMoney(c.expected_salary)} / month` : '—'],
                ['Skills', c.skills || '—'],
                ['Consent', c.consent_at ? `Given ${fmtDate(c.consent_at)}` : 'Not recorded'],
              ]} />
              {c.why && <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">“{c.why}”</p>}
            </CardBody>
          </Card>
          {suite?.resume?.summary || c.resume_text ? (
            <Card>
              <CardHeader title={<span className="flex items-center gap-1.5"><FileText className="size-3.5" />Resume</span>} />
              <CardBody className="space-y-2 text-[13px]">
                {suite?.resume?.summary && <p>{suite.resume.summary}</p>}
                {suite?.resume?.skills?.length ? <div className="flex flex-wrap gap-1">{suite.resume.skills.slice(0, 12).map(s => <Badge key={s}>{s}</Badge>)}</div> : null}
                {c.resume_text && <details className="text-muted"><summary className="cursor-pointer text-[12.5px] hover:text-fg">Full text</summary><pre className="mt-2 max-h-80 overflow-y-auto font-sans text-[12px] whitespace-pre-wrap">{c.resume_text}</pre></details>}
              </CardBody>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
