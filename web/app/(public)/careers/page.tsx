'use client';
import Link from 'next/link';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Clock, Headphones, MapPin, Mic, Sparkles } from 'lucide-react';
import { useApi } from '@/lib/api';
import type { Config, Job } from '@/lib/types';
import { Card, EmptyState, Skeleton } from '@/components/ui/primitives';

// Old apply links were /?role=<id>; send them to the role's own page.
function LegacyRoleRedirect({ jobs }: { jobs?: Job[] }) {
  const want = useSearchParams().get('role');
  const router = useRouter();
  useEffect(() => {
    if (!want || !jobs) return;
    const j = jobs.find(x => x.id === want || x.id.startsWith(want));
    if (j) router.replace(`/apply/${j.id}`);
  }, [want, jobs, router]);
  return null;
}

export default function CareersPage() {
  const { data: cfg } = useApi<Config>('/api/config');
  const { data: jobs } = useApi<Job[]>('/api/jobs');
  const open = (jobs || []).filter(j => j.status !== 'closed' && j.status !== 'paused');

  return (
    <>
      <Suspense><LegacyRoleRedirect jobs={jobs} /></Suspense>
      <section className="border-b border-border bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,var(--accent-soft),transparent)]">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[12px] text-muted shadow-card"><Sparkles className="size-3 text-accent" />Apply in two minutes, interview right away</p>
          <h1 className="max-w-2xl text-[34px] leading-[1.1] font-semibold tracking-tight sm:text-[44px]">Join {cfg?.brand || 'our team'}</h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            No waiting for a callback. After you apply, {cfg?.agent_name || 'our AI recruiter'} interviews you in your browser for about six minutes, and a person on the hiring team reviews every interview.
          </p>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            {[[Clock, 'About 6 minutes', 'A short, friendly conversation'], [Headphones, 'From your browser', 'Headphones help; no app needed'], [Mic, 'Reviewed by people', 'The AI never makes the final call']].map(([Icon, t, d]: any) => (
              <div key={t} className="flex gap-3 rounded-xl border border-border bg-surface/70 p-3 shadow-card"><Icon className="mt-0.5 size-4 shrink-0 text-accent" /><div><p className="text-[13px] font-medium">{t}</p><p className="text-[12px] text-muted">{d}</p></div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12">
        <div className="mb-5 flex items-baseline justify-between"><h2 className="text-[18px] font-semibold tracking-tight">Open roles</h2>{jobs && <span className="text-[13px] text-muted">{open.length} open</span>}</div>
        {!jobs ? <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
          : !open.length ? <Card><EmptyState title="No open roles right now" description="Please check back soon." /></Card>
          : (
            <ul className="space-y-3">
              {open.map(j => (
                <li key={j.id}>
                  <Link href={`/apply/${j.id}`} className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-5 shadow-card transition-[border,box-shadow] hover:border-border-strong hover:shadow-pop">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-semibold tracking-tight">{j.title}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted"><span className="inline-flex items-center gap-1"><MapPin className="size-3" />{j.location || 'Flexible'}</span><span>{j.min_years}+ years</span>{j.company && <span>{j.company}</span>}</p>
                      {j.description && <p className="mt-2 line-clamp-2 text-[13px] text-muted">{j.description}</p>}
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-accent">Apply<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}
