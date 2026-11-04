'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, PhoneCall, Keyboard } from 'lucide-react';
import { useApi } from '@/lib/api';
import type { CallRow } from '@/lib/types';
import { fmtDateTime, fmtDuration, maskPhone, titleCase, verdictTone } from '@/lib/utils';
import { Badge, Card, EmptyState, PageHeader, ScoreRing, Skeleton, Stat, Tabs } from '@/components/ui/primitives';

const MODE_ICON = { phone: PhoneCall, web: Mic, simulator: Keyboard } as const;

export default function CallsPage() {
  const router = useRouter();
  const { data } = useApi<CallRow[]>('/api/calls', 5000);
  const [filter, setFilter] = useState<'all' | 'completed' | 'in_progress' | 'incomplete'>('all');
  const rows = useMemo(() => (data || []).filter(r => filter === 'all' || r.status === filter), [data, filter]);
  const done = (data || []).filter(r => r.status === 'completed');
  const avgDur = done.length ? Math.round(done.reduce((s, r) => s + (r.duration_sec || 0), 0) / done.length) : null;
  const count = (s: string) => (data || []).filter(r => r.status === s).length;

  return (
    <>
      <PageHeader title="Interviews log" description="Every AI interview: browser, phone and typed. Updates live." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total interviews" value={data?.length ?? '—'} />
        <Stat label="Completed" value={done.length} tone="success" />
        <Stat label="Average length" value={fmtDuration(avgDur)} hint="completed interviews" />
        <Stat label="Live now" value={count('in_progress')} tone="accent" />
      </div>
      <Card>
        <Tabs value={filter} onChange={setFilter} className="px-4 pt-2" items={[
          { id: 'all', label: 'All', count: data?.length }, { id: 'completed', label: 'Completed', count: done.length },
          { id: 'in_progress', label: 'In progress', count: count('in_progress') }, { id: 'incomplete', label: 'Incomplete', count: count('incomplete') },
        ]} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="border-b border-border bg-surface-2/40 text-left text-[12px] text-muted">
              <tr>{['Candidate', 'Role', 'Mode', 'Status', 'Length', 'Turns', 'Score', 'Started'].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data && Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={8} className="px-4 py-3"><Skeleton className="h-6" /></td></tr>)}
              {rows.map(r => {
                const Icon = MODE_ICON[r.mode as keyof typeof MODE_ICON] || Mic;
                return (
                  <tr key={r.id} onClick={() => router.push(`/dashboard/candidates/${r.candidate_id}`)} className="cursor-pointer hover:bg-surface-2/60">
                    <td className="px-4 py-2.5"><p className="font-medium">{r.name}</p><p className="text-[12px] text-muted">{maskPhone(r.phone)}</p></td>
                    <td className="px-4 py-2.5 text-muted">{r.job_title}</td>
                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5"><Icon className="size-3.5 text-subtle" />{r.mode === 'web' ? 'Browser' : titleCase(r.mode)}</span></td>
                    <td className="px-4 py-2.5"><Badge dot tone={r.status === 'completed' ? 'success' : r.status === 'in_progress' ? 'accent' : 'warning'}>{r.status === 'in_progress' ? 'Live' : titleCase(r.status)}</Badge>{r.failure_reason && <p className="mt-0.5 text-[11.5px] text-subtle">{titleCase(r.failure_reason)}</p>}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{fmtDuration(r.duration_sec)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.turns || '—'}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2"><ScoreRing value={r.status === 'completed' ? r.total : null} size={28} stroke={3} />{r.status === 'completed' && r.verdict && <Badge tone={verdictTone(r.verdict)}>{r.verdict}</Badge>}</div></td>
                    <td className="px-4 py-2.5 text-muted">{fmtDateTime(r.started_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data && !rows.length && <EmptyState icon={Mic} title="No interviews here" description="Interviews appear the moment a candidate starts one." />}
        </div>
      </Card>
    </>
  );
}
