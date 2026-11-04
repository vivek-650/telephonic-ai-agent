'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Download, Search, Users } from 'lucide-react';
import { useApi } from '@/lib/api';
import type { CandidateRow } from '@/lib/types';
import { STAGES, cn, fmtMoney, fmtRelative, stageLabel, stageTone, verdictTone } from '@/lib/utils';
import { Badge, Card, EmptyState, PageHeader, ScoreRing, Skeleton, Avatar } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/form';
import { ButtonLink } from '@/components/ui/button';
import { RoleFilter } from '@/components/dashboard/role-filter';

type SortKey = 'total' | 'name' | 'created_at' | 'years' | 'expected_salary';

export default function CandidatesPage() {
  const router = useRouter();
  const { data } = useApi<CandidateRow[]>('/api/candidates', 10000);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [stage, setStage] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'total', dir: -1 });

  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return (data || [])
      .filter(c => (!role || c.job_id === role) && (!stage || c.stage === stage) && (!t || `${c.name} ${c.email} ${c.city} ${c.skills}`.toLowerCase().includes(t)))
      .sort((a, b) => {
        const x = a[sort.key] ?? -Infinity, y = b[sort.key] ?? -Infinity;
        return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      });
  }, [data, q, role, stage, sort]);

  const Th = ({ k, children, className }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn('px-4 py-2.5 text-left text-[12px] font-medium text-muted', className)}>
      {k ? (
        <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setSort(s => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>
          {children}{sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </button>
      ) : children}
    </th>
  );

  return (
    <>
      <PageHeader title="Candidates" description={data ? `${data.length} applicants across all roles` : 'Loading…'}
        actions={<ButtonLink href="/api/export/candidates.csv" external><Download className="size-3.5" /> Export CSV</ButtonLink>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1 min-w-52"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, city or skill" className="h-8 pl-8 text-[13px]" /></div>
          <RoleFilter value={role} onChange={setRole} />
          <Select value={stage} onChange={e => setStage(e.target.value)} className="h-8 w-auto text-[13px]" aria-label="Filter by stage">
            <option value="">All stages</option>
            {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead className="border-b border-border bg-surface-2/40">
              <tr><Th k="name">Candidate</Th><Th>Role</Th><Th>Stage</Th><Th k="total">Score</Th><Th k="years">Experience</Th><Th k="expected_salary">Expected</Th><Th>Key issue</Th><Th k="created_at" className="text-right">Applied</Th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={8} className="px-4 py-3"><Skeleton className="h-6" /></td></tr>)}
              {rows.map(c => (
                <tr key={c.id} onClick={() => router.push(`/dashboard/candidates/${c.id}`)} className="cursor-pointer transition-colors hover:bg-surface-2/60">
                  <td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><Avatar name={c.name} size={28} /><div className="min-w-0"><p className="truncate font-medium">{c.name}</p><p className="truncate text-[12px] text-muted">{c.city}</p></div></div></td>
                  <td className="px-4 py-2.5 text-muted">{c.job_title}</td>
                  <td className="px-4 py-2.5"><Badge tone={stageTone(c.stage)}>{stageLabel(c.stage)}</Badge></td>
                  <td className="px-4 py-2.5"><div className="flex items-center gap-2"><ScoreRing value={c.verdict !== 'Pending screen' ? c.total : null} size={30} stroke={3} />{c.verdict && <Badge tone={verdictTone(c.verdict)}>{c.verdict}</Badge>}</div></td>
                  <td className="px-4 py-2.5 tabular-nums">{c.years != null ? `${c.years} yrs` : '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fmtMoney(c.expected_salary)}</td>
                  <td className="max-w-64 px-4 py-2.5"><span className="line-clamp-1 text-[12.5px] text-danger">{c.blocker || ''}</span></td>
                  <td className="px-4 py-2.5 text-right text-muted">{fmtRelative(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !rows.length && <EmptyState icon={Users} title={data.length ? 'No candidates match these filters' : 'No candidates yet'} description={data.length ? 'Clear the search or pick another role.' : 'Share a role’s apply link or import a CSV of leads.'} />}
        </div>
      </Card>
    </>
  );
}
