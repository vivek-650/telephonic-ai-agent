'use client';
// Candidate self-booking for the human interview: /book?c=<candidate id>
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarCheck2, CalendarX2, Video } from 'lucide-react';
import { ApiError, post, useApi } from '@/lib/api';
import { cn, toDate } from '@/lib/utils';
import { Card, EmptyState, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

type Slots = { candidate: { first_name: string; job_title: string; company: string }; open: boolean; slots: string[]; existing: { starts_at: string; meet_link: string } | null };
const IST = { timeZone: 'Asia/Kolkata' } as const;
const day = (s: string) => toDate(s)!.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...IST });
const time = (s: string) => toDate(s)!.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', ...IST });

function Booking() {
  const c = useSearchParams().get('c') || '';
  const { data, error, mutate } = useApi<Slots>(c ? `/api/public/slots?c=${encodeURIComponent(c)}` : null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const days = useMemo(() => (data?.slots || []).reduce<Record<string, string[]>>((g, s) => { (g[day(s)] ||= []).push(s); return g; }, {}), [data]);
  const [active, setActive] = useState<string | null>(null);
  const shown = active || Object.keys(days)[0];

  const book = async () => {
    if (!pick) return; setBusy(true); setErr(null);
    try { await post('/api/public/book', { candidate_id: c, starts_at: pick }); mutate(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not book'); }
    setBusy(false);
  };

  if (!c || error) return <Card><EmptyState icon={CalendarX2} title="This booking link is not valid" description="Please use the link from your message, or reply to it for help." /></Card>;
  if (!data) return <Skeleton className="h-80 rounded-xl" />;
  if (data.existing) return (
    <Card className="p-8 text-center">
      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-success-soft text-success"><CalendarCheck2 className="size-6" /></span>
      <h1 className="text-[20px] font-semibold tracking-tight">You’re booked, {data.candidate.first_name}</h1>
      <p className="mt-2 text-[14px] text-muted">{data.candidate.job_title} interview at {data.candidate.company}</p>
      <p className="mt-4 text-[16px] font-medium">{day(data.existing.starts_at)} · {time(data.existing.starts_at)} IST</p>
      {data.existing.meet_link && <a href={data.existing.meet_link} className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline" target="_blank" rel="noreferrer"><Video className="size-4" />Meeting link</a>}
    </Card>
  );
  if (!data.open) return <Card><EmptyState icon={CalendarX2} title="Booking isn’t open yet" description="We’ll message you as soon as the hiring team is ready to meet." /></Card>;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Pick a time, {data.candidate.first_name}</h1>
        <p className="mt-1 text-[13.5px] text-muted">{data.candidate.job_title} interview at {data.candidate.company}. All times are India time (IST).</p>
      </div>
      {!data.slots.length ? <EmptyState title="No free slots this week" description="Reply to your message and we’ll find a time." /> : (
        <div className="grid sm:grid-cols-[180px_1fr]">
          <div className="flex gap-1 overflow-x-auto border-b border-border p-3 sm:flex-col sm:border-r sm:border-b-0">
            {Object.keys(days).map(d => <button key={d} onClick={() => setActive(d)} className={cn('shrink-0 rounded-lg px-3 py-2 text-left text-[13px]', shown === d ? 'bg-fg font-medium text-bg' : 'text-muted hover:bg-surface-2')}>{d}</button>)}
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(days[shown] || []).map(s => <button key={s} onClick={() => setPick(s)} className={cn('rounded-lg border px-3 py-2 font-mono text-[13px] tabular-nums transition-colors', pick === s ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:border-border-strong')}>{time(s)}</button>)}
            </div>
            {err && <p className="mt-3 text-[13px] text-danger">{err}</p>}
            <Button variant="primary" size="lg" className="mt-5 w-full" disabled={!pick} loading={busy} onClick={book}>{pick ? `Book ${day(pick)}, ${time(pick)}` : 'Choose a time'}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function BookPage() {
  return <div className="mx-auto max-w-2xl px-5 py-14"><Suspense><Booking /></Suspense></div>;
}
