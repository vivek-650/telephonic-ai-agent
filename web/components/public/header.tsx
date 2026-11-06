'use client';
import Link from 'next/link';
import { useApi } from '@/lib/api';
import type { Config } from '@/lib/types';
import { LogoMark } from '@/components/brand/logo';

// Candidate-facing pages carry the employer's name (BRAND_NAME), not the platform's.
export function PublicHeader() {
  const { data } = useApi<Config>('/api/config');
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-5">
        <Link href="/careers" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[14px] font-semibold tracking-tight">{data?.brand || 'Careers'}</span>
        </Link>
        <Link href="/careers" className="ml-auto text-[12.5px] text-muted hover:text-fg">All open roles</Link>
      </div>
    </header>
  );
}
