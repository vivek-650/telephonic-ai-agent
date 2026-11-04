'use client';
import { useApi } from '@/lib/api';
import type { Job } from '@/lib/types';
import { Select } from '@/components/ui/form';

export function RoleFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useApi<Job[]>('/api/jobs');
  return (
    <Select value={value} onChange={e => onChange(e.target.value)} className="h-8 w-auto min-w-44 text-[13px]" aria-label="Filter by role">
      <option value="">All roles</option>
      {(data || []).map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
    </Select>
  );
}
