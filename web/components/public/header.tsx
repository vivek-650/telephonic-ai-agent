'use client';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useApi } from '@/lib/api';
import type { Config } from '@/lib/types';

export function PublicHeader() {
  const { data } = useApi<Config>('/api/config');
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-fg text-bg"><Sparkles className="size-3.5" /></span>
          <span className="text-[14px] font-semibold tracking-tight">{data?.brand || 'Careers'}</span>
        </Link>
        <span className="ml-auto text-[12.5px] text-muted">Careers</span>
      </div>
    </header>
  );
}
