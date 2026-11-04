'use client';
import Link from 'next/link';
import { Users, Mic, Sparkles, Clock, ThumbsUp, ArrowRight, AlertTriangle, PhoneCall } from 'lucide-react';
import { useApi } from '@/lib/api';
import type { Analytics, CallRow, CandidateRow, Stats } from '@/lib/types';
import { Card, CardBody, CardHeader, PageHeader, Stat, Badge, Avatar, ScoreRing, Skeleton, EmptyState } from '@/components/ui/primitives';
import { ButtonLink } from '@/components/ui/button';
import { Funnel, Histogram, Donut, GroupedBars } from '@/components/charts';
import { fmtDuration, fmtRelative, verdictTone, titleCase } from '@/lib/utils';

export default function OverviewPage() {
  const { data: stats } = useApi<Stats>('/api/stats', 10000);
  const { data: an } = useApi<Analytics>('/api/analytics', 15000);
  const { data: cands } = useApi<CandidateRow[]>('/api/candidates', 10000);
  const { data: calls } = useApi<CallRow[]>('/api/calls', 10000);

  const top = (cands || []).filter(c => c.total != null && c.verdict && c.verdict !== 'Pending screen' && c.stage !== 'rejected').sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).slice(0, 5);
  const review = (cands || []).filter(c => c.stage === 'review');

  return (
    <>
      <PageHeader title="Overview" description="Every applicant is interviewed by the AI, scored on a 100-point rubric and ranked for you."
        actions={<><ButtonLink href="/dashboard/import">Import leads</ButtonLink><ButtonLink href="/dashboard/pipeline" variant="primary">Open pipeline <ArrowRight className="size-3.5" /></ButtonLink></>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats ? (<>
          <Stat label="Applicants" value={stats.total} icon={Users} hint={`${stats.by_stage.find(s => s.stage === 'applied')?.n ?? 0} waiting for an interview`} />
          <Stat label="AI interviews done" value={stats.screened} icon={Mic} tone="accent" hint={an?.median_minutes_to_screen != null ? `median ${an.median_minutes_to_screen} min from applying` : 'from application to interview'} />
          <Stat label="Strong matches" value={stats.strong} icon={Sparkles} tone="success" hint={stats.avg_score != null ? `average score ${stats.avg_score}` : 'no scores yet'} />
          <Stat label="Recruiter time saved" value={`${Math.round(stats.minutes_saved / 60)}h`} icon={Clock} hint={`${stats.minutes_saved} min of phone screens`} />
          <Stat label="AI agreement" value={an?.ai_helpful_rate != null ? `${an.ai_helpful_rate}%` : '—'} icon={ThumbsUp} hint={`${stats.feedback_count} recruiter reviews`} />
        </>) : Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[106px] rounded-xl" />)}
      </div>

      {review.length > 0 && (
        <Link href="/dashboard/pipeline" className="mt-4 flex items-center gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-[13px] text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          <span><b>{review.length} candidate{review.length === 1 ? '' : 's'}</b> need a human decision{an?.spot_checks_open ? `, including ${an.spot_checks_open} auto-rejects sampled for a fairness spot check` : ''}.</span>
          <ArrowRight className="ml-auto size-4" />
        </Link>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Hiring funnel" description="Applicants at each step, with conversion from applied" />
          <CardBody>{an ? <Funnel data={an.funnel} /> : <Skeleton className="h-48" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Where applicants come from" />
          <CardBody>{an ? (an.sources.length ? <Donut data={an.sources.map(s => ({ ...s, label: s.label.replace(/^csv:/, 'Import: ') }))} /> : <EmptyState title="No applicants yet" />) : <Skeleton className="h-44" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Score distribution" description="Interviewed candidates by score band" />
          <CardBody>{an ? <Histogram data={an.score_hist} /> : <Skeleton className="h-44" />}</CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="By role" description="Applied, interviewed, shortlisted and hired per open role" />
          <CardBody>{an ? (an.per_job.length ? <GroupedBars data={an.per_job.map(j => ({ name: j.job, ...j }))} keys={[{ key: 'applied', label: 'Applied' }, { key: 'screened', label: 'Interviewed' }, { key: 'shortlisted', label: 'Shortlisted' }, { key: 'hired', label: 'Hired' }]} /> : <EmptyState title="No roles yet" action={<ButtonLink href="/dashboard/roles" size="sm">Create a role</ButtonLink>} />) : <Skeleton className="h-52" />}</CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top candidates" description="Highest scores still in play" action={<ButtonLink href="/dashboard/candidates" variant="ghost" size="sm">View all</ButtonLink>} />
          <ul className="divide-y divide-border border-t border-border">
            {!cands && Array.from({ length: 4 }, (_, i) => <li key={i} className="px-5 py-3"><Skeleton className="h-8" /></li>)}
            {cands && !top.length && <EmptyState icon={Sparkles} title="No scored candidates yet" description="Scores appear here as soon as the AI finishes an interview." />}
            {top.map(c => (
              <li key={c.id}>
                <Link href={`/dashboard/candidates/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{c.name}</p><p className="truncate text-[12px] text-muted">{c.job_title} · {c.city}</p></div>
                  <Badge tone={verdictTone(c.verdict)}>{c.verdict}</Badge>
                  <ScoreRing value={c.total} size={36} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Latest AI interviews" action={<ButtonLink href="/dashboard/calls" variant="ghost" size="sm">View log</ButtonLink>} />
          <ul className="divide-y divide-border border-t border-border">
            {calls && !calls.length && <EmptyState icon={PhoneCall} title="No interviews yet" description="Share a role's apply link and interviews show up here live." />}
            {(calls || []).slice(0, 5).map(x => (
              <li key={x.id}>
                <Link href={`/dashboard/candidates/${x.candidate_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                  <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-muted">{x.mode === 'phone' ? <PhoneCall className="size-3.5" /> : <Mic className="size-3.5" />}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{x.name}</p><p className="truncate text-[12px] text-muted">{x.job_title} · {titleCase(x.mode)} · {fmtDuration(x.duration_sec)}</p></div>
                  <Badge tone={x.status === 'completed' ? 'success' : x.status === 'in_progress' ? 'accent' : 'neutral'} dot>{x.status === 'in_progress' ? 'Live' : titleCase(x.status)}</Badge>
                  <span className="w-16 text-right text-[12px] text-subtle">{fmtRelative(x.started_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
