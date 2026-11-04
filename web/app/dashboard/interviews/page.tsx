'use client';
import Link from 'next/link';
import { CalendarDays, Video } from 'lucide-react';
import { useApi } from '@/lib/api';
import type { Interview } from '@/lib/types';
import { cn, titleCase, toDate } from '@/lib/utils';
import { Badge, Card, EmptyState, PageHeader, Skeleton, Stat } from '@/components/ui/primitives';

const dayKey = (s: string) => toDate(s)!.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
const time = (s: string) => toDate(s)!.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export default function SchedulePage() {
  const { data } = useApi<Interview[]>('/api/interviews', 15000);
  const now = Date.now();
  const upcoming = (data || []).filter(i => i.status === 'scheduled' && toDate(i.starts_at)!.getTime() > now - 3600e3).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = (data || []).filter(i => !upcoming.includes(i));
  const groups = upcoming.reduce<Record<string, Interview[]>>((g, i) => { (g[dayKey(i.starts_at)] ||= []).push(i); return g; }, {});
  const n = (s: string) => (data || []).filter(i => i.status === s).length;

  const Row = ({ i }: { i: Interview }) => (
    <Link href={`/dashboard/candidates/${i.candidate_id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2/60">
      <span className="w-20 shrink-0 font-mono text-[12.5px] tabular-nums">{time(i.starts_at)}</span>
      <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{i.candidate_name}</p><p className="truncate text-[12px] text-muted">{i.job_title}{i.recruiter_name ? ` · with ${i.recruiter_name}` : ''} · {i.duration_min} min</p></div>
      {!!i.scorecards && <Badge>{i.scorecards} scorecard{i.scorecards === 1 ? '' : 's'}</Badge>}
      <Badge tone={i.status === 'scheduled' ? 'accent' : i.status === 'completed' ? 'success' : 'warning'}>{titleCase(i.status)}</Badge>
      {i.meet_link && i.status === 'scheduled' && <a onClick={e => e.stopPropagation()} href={i.meet_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline"><Video className="size-3.5" />Join</a>}
    </Link>
  );

  return (
    <>
      <PageHeader title="Schedule" description="Human interviews for shortlisted candidates. Candidates can book their own slot from their link." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Upcoming" value={upcoming.length} tone="accent" /><Stat label="Completed" value={n('completed')} tone="success" />
        <Stat label="No-shows" value={n('no_show')} tone="warning" hint="the AI calls no-shows to rebook" /><Stat label="Cancelled" value={n('cancelled')} />
      </div>
      {!data ? <Skeleton className="h-64 rounded-xl" /> : !data.length ? <Card><EmptyState icon={CalendarDays} title="No interviews yet" description="Schedule one from a candidate’s Hiring tab, or send them their booking link." /></Card> : (
        <div className="space-y-4">
          {Object.entries(groups).map(([day, items]) => (
            <Card key={day}><h2 className="border-b border-border px-5 py-3 text-[12.5px] font-semibold">{day}</h2><div className="divide-y divide-border">{items.map(i => <Row key={i.id} i={i} />)}</div></Card>
          ))}
          {past.length > 0 && <Card className={cn(!upcoming.length && 'mt-0')}><h2 className="border-b border-border px-5 py-3 text-[12.5px] font-semibold text-muted">Past and closed</h2><div className="divide-y divide-border">{past.map(i => <Row key={i.id} i={i} />)}</div></Card>}
        </div>
      )}
    </>
  );
}
