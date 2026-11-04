'use client';
// Kanban pipeline: AI-ranked cards per stage, drag to move. Moves are optimistic and roll back on failure.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Search } from 'lucide-react';
import { post, useApi } from '@/lib/api';
import type { CandidateRow, Stage } from '@/lib/types';
import { STAGES, cn, fmtRelative, verdictTone } from '@/lib/utils';
import { useRecruiterId } from '@/lib/recruiter';
import { Badge, PageHeader, ScoreRing, Skeleton } from '@/components/ui/primitives';
import { Input } from '@/components/ui/form';
import { RoleFilter } from '@/components/dashboard/role-filter';

function CandidateCard({ c, onDragStart }: { c: CandidateRow; onDragStart: (id: string) => void }) {
  const red = c.flags.filter(f => f.level === 'red');
  return (
    <Link href={`/dashboard/candidates/${c.id}`} draggable onDragStart={e => { e.dataTransfer.setData('text/plain', c.id); onDragStart(c.id); }}
      className="group block rounded-lg border border-border bg-surface p-3 shadow-card transition-[box-shadow,border] hover:border-border-strong hover:shadow-pop">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{c.name}</p>
          <p className="truncate text-[12px] text-muted">{c.job_title}</p>
        </div>
        <ScoreRing value={c.verdict && c.verdict !== 'Pending screen' ? c.total : null} size={34} stroke={3} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {c.verdict && <Badge tone={verdictTone(c.verdict)}>{c.verdict}</Badge>}
        {c.spot_check ? <Badge tone="accent">Spot check</Badge> : null}
        <span className="ml-auto text-[11.5px] text-subtle">{fmtRelative(c.created_at)}</span>
      </div>
      {(c.blocker || red.length > 0) && (
        <p className="mt-2 flex gap-1.5 text-[11.5px] leading-snug text-danger"><AlertTriangle className="mt-px size-3 shrink-0" /><span className="line-clamp-2">{c.blocker || red[0].text}</span></p>
      )}
    </Link>
  );
}

export default function PipelinePage() {
  const { data, mutate } = useApi<CandidateRow[]>('/api/candidates', 5000);
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [over, setOver] = useState<Stage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [recruiter] = useRecruiterId();

  const columns = useMemo(() => {
    const rows = (data || []).filter(c => (!role || c.job_id === role) && (!q || `${c.name} ${c.city} ${c.job_title}`.toLowerCase().includes(q.toLowerCase())));
    return STAGES.map(s => ({ ...s, items: rows.filter(c => c.stage === s.id).sort((a, b) => (b.total ?? -1) - (a.total ?? -1)) }));
  }, [data, role, q]);

  const move = async (id: string, stage: Stage) => {
    const c = data?.find(x => x.id === id);
    if (!c || c.stage === stage) return;
    await mutate(rows => rows?.map(x => (x.id === id ? { ...x, stage } : x)), { revalidate: false });
    try {
      await post(`/api/candidates/${id}/stage`, { stage, recruiter_id: recruiter || undefined });
      toast.success(`${c.name} moved to ${STAGES.find(s => s.id === stage)?.label}`);
    } catch (e: any) { toast.error(e.message); }
    mutate();
  };

  return (
    <>
      <PageHeader title="Pipeline" description="Ranked by AI score within each stage. Drag a card to move it; the AI never moves anyone past Shortlisted on its own."
        actions={<>
          <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="h-8 w-48 pl-8 text-[13px]" /></div>
          <RoleFilter value={role} onChange={setRole} />
        </>} />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
        <div className="grid min-w-max auto-cols-[264px] grid-flow-col gap-3">
          {columns.map(col => (
            <section key={col.id} aria-label={col.label}
              onDragOver={e => { e.preventDefault(); setOver(col.id); }} onDragLeave={() => setOver(o => (o === col.id ? null : o))}
              onDrop={e => { e.preventDefault(); setOver(null); setDragging(null); move(e.dataTransfer.getData('text/plain'), col.id); }}
              className={cn('flex max-h-[calc(100dvh-210px)] flex-col rounded-xl border bg-surface-2/50 transition-colors', over === col.id && dragging ? 'border-accent bg-accent-soft' : 'border-border')}>
              <header className="flex items-center justify-between px-3 pt-3 pb-2">
                <h2 className="text-[12.5px] font-semibold">{col.label}</h2>
                <span className="rounded-md bg-surface px-1.5 font-mono text-[11px] text-muted ring-1 ring-border tabular-nums">{col.items.length}</span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {!data && Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
                {col.items.map(c => <div key={c.id} className="relative"><CandidateCard c={c} onDragStart={setDragging} /></div>)}
                {data && !col.items.length && <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-subtle">No one here</p>}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
