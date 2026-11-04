'use client';
import { useRouter } from 'next/navigation';
import { FileSignature } from 'lucide-react';
import { useApi } from '@/lib/api';
import type { Offer } from '@/lib/types';
import { fmtDate, fmtMoney, titleCase } from '@/lib/utils';
import { Badge, Card, EmptyState, PageHeader, Skeleton, Stat } from '@/components/ui/primitives';

const TONE = { draft: 'neutral', sent: 'accent', negotiating: 'warning', accepted: 'success', declined: 'danger' } as const;

export default function OffersPage() {
  const router = useRouter();
  const { data } = useApi<Offer[]>('/api/offers', 15000);
  const n = (s: Offer['status']) => (data || []).filter(o => o.status === s).length;
  const decided = n('accepted') + n('declined');
  return (
    <>
      <PageHeader title="Offers" description="Drafted from the role and the negotiated salary. Accepting an offer starts onboarding." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open" value={n('draft') + n('sent') + n('negotiating')} tone="accent" />
        <Stat label="Accepted" value={n('accepted')} tone="success" />
        <Stat label="Declined" value={n('declined')} tone="danger" />
        <Stat label="Acceptance rate" value={decided ? `${Math.round((n('accepted') / decided) * 100)}%` : '—'} />
      </div>
      <Card>
        {!data ? <Skeleton className="m-5 h-40" /> : !data.length ? <EmptyState icon={FileSignature} title="No offers yet" description="Draft an offer from a candidate’s Hiring tab." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="border-b border-border bg-surface-2/40 text-left text-[12px] text-muted"><tr>{['Candidate', 'Role', 'Salary', 'Joining', 'Status', 'Note'].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {data.map(o => (
                  <tr key={o.id} onClick={() => router.push(`/dashboard/candidates/${o.candidate_id}`)} className="cursor-pointer hover:bg-surface-2/60">
                    <td className="px-4 py-2.5 font-medium">{o.candidate_name}</td>
                    <td className="px-4 py-2.5 text-muted">{o.job_title}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fmtMoney(o.salary)}<span className="text-subtle"> /mo</span></td>
                    <td className="px-4 py-2.5">{fmtDate(o.joining_date)}</td>
                    <td className="px-4 py-2.5"><Badge tone={TONE[o.status]}>{titleCase(o.status)}</Badge></td>
                    <td className="max-w-72 px-4 py-2.5 text-[12px] text-warning"><span className="line-clamp-1">{o.warning}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
