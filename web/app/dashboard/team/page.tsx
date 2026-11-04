'use client';
import { UsersRound } from 'lucide-react';
import { useApi } from '@/lib/api';
import { fmtRelative } from '@/lib/utils';
import { Avatar, Badge, Card, CardBody, EmptyState, Meter, PageHeader, Skeleton } from '@/components/ui/primitives';

type Member = { id: string; name: string; role: string; actions: number; candidates: number; notes: number; calls: number; interviews: number; stage_moves: number; reviews: number; agree_with_ai: number | null; avg_interview_rating: number | null; last_active: string | null; outlier: string | null };

export default function TeamPage() {
  const { data } = useApi<Member[]>('/api/team', 20000);
  const max = Math.max(1, ...(data || []).map(m => m.actions));
  return (
    <>
      <PageHeader title="Team" description="What each recruiter did, and how often they agreed with the AI screen." />
      {!data ? <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
        : !data.length ? <Card><EmptyState icon={UsersRound} title="No recruiters yet" /></Card> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map(m => (
              <Card key={m.id}>
                <CardBody className="space-y-4 pt-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name} size={40} />
                    <div className="min-w-0 flex-1"><p className="font-medium">{m.name}</p><p className="text-[12px] text-muted">{m.role} · active {fmtRelative(m.last_active)}</p></div>
                    {m.outlier && <Badge tone={m.outlier === 'high output' ? 'success' : 'warning'}>{m.outlier}</Badge>}
                  </div>
                  <div><div className="mb-1 flex justify-between text-[12px] text-muted"><span>Actions</span><span className="font-mono tabular-nums text-fg">{m.actions}</span></div><Meter value={m.actions} max={max} /></div>
                  <dl className="grid grid-cols-3 gap-3 text-center">
                    {([['Candidates', m.candidates], ['Notes', m.notes], ['Calls', m.calls], ['Interviews', m.interviews], ['Stage moves', m.stage_moves], ['AI reviews', m.reviews]] as const).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-surface-2/60 py-2"><dd className="text-[16px] font-semibold tabular-nums">{v}</dd><dt className="text-[11px] text-muted">{k}</dt></div>
                    ))}
                  </dl>
                  <div className="flex justify-between border-t border-border pt-3 text-[12.5px]">
                    <span className="text-muted">Agrees with AI <b className="text-fg">{m.agree_with_ai != null ? `${m.agree_with_ai}%` : '—'}</b></span>
                    <span className="text-muted">Avg. rating <b className="text-fg">{m.avg_interview_rating ?? '—'}</b></span>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
    </>
  );
}
