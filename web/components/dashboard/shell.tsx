'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, KanbanSquare, Users, PhoneCall, Briefcase, Upload, CalendarDays, FileSignature,
  UsersRound, Workflow, Cpu, Settings, ExternalLink, Moon, Sun, LogOut, Menu, X, Sparkles,
} from 'lucide-react';
import { api, post, useApi } from '@/lib/api';
import type { Config } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AssistantButton } from './assistant';
import { useRecruiterId } from '@/lib/recruiter';
import type { Recruiter } from '@/lib/types';

const NAV = [
  { section: 'Workspace', items: [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/pipeline', label: 'Pipeline', icon: KanbanSquare },
    { href: '/dashboard/candidates', label: 'Candidates', icon: Users },
    { href: '/dashboard/calls', label: 'Interviews log', icon: PhoneCall },
  ] },
  { section: 'Hiring', items: [
    { href: '/dashboard/roles', label: 'Roles', icon: Briefcase },
    { href: '/dashboard/import', label: 'Import leads', icon: Upload },
    { href: '/dashboard/interviews', label: 'Schedule', icon: CalendarDays },
    { href: '/dashboard/offers', label: 'Offers', icon: FileSignature },
  ] },
  { section: 'Operations', items: [
    { href: '/dashboard/team', label: 'Team', icon: UsersRound },
    { href: '/dashboard/automation', label: 'Automation', icon: Workflow },
    { href: '/dashboard/engine', label: 'Engine room', icon: Cpu },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ] },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const flip = () => {
    const next = !dark; setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* private mode */ }
  };
  return (
    <button onClick={flip} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Toggle theme">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function RecruiterPicker() {
  const { data } = useApi<Recruiter[]>('/api/recruiters');
  const [id, setId] = useRecruiterId();
  useEffect(() => { if (data?.length && !data.some(r => r.id === id)) setId(data[0].id); }, [data, id, setId]);
  if (!data?.length) return null;
  return (
    <label className="hidden h-8 items-center gap-2 rounded-lg border border-border bg-surface pl-2.5 sm:flex text-[12.5px] text-muted shadow-card">
      Acting as
      <select value={id} onChange={e => setId(e.target.value)} className="h-full rounded-r-lg bg-transparent pr-2 font-medium text-fg focus:outline-none">
        {data.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </label>
  );
}

function VoiceStatus({ cfg }: { cfg?: Config }) {
  const live = cfg?.dograh_api_live, ready = cfg?.dograh_web || cfg?.dograh_phone;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-2 text-[12px] font-medium">
        <span className={cn('size-2 rounded-full', !cfg ? 'bg-subtle' : live && ready ? 'bg-success' : ready ? 'bg-warning' : 'bg-danger')} />
        Voice engine {!cfg ? '…' : live && ready ? 'online' : ready ? 'unreachable' : 'not set up'}
      </div>
      <p className="mt-0.5 text-[11.5px] text-muted">
        {cfg ? [cfg.dograh_web && 'Browser', cfg.dograh_phone && 'Phone'].filter(Boolean).join(' · ') || 'Connect Dograh in Settings' : 'Checking…'}
      </p>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: cfg } = useApi<Config>('/api/config', 30000);
  const { data: me } = useApi<{ auth_required: boolean; logged_in: boolean }>('/api/me');

  useEffect(() => {
    const go = () => router.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
    window.addEventListener('auth:required', go);
    return () => window.removeEventListener('auth:required', go);
  }, [router]);
  useEffect(() => { if (me?.auth_required && !me.logged_in) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [me, pathname, router]);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href === '/dashboard' ? pathname === href : pathname.startsWith(href));
  const logout = async () => { await post('/api/logout').catch(() => {}); router.replace('/login'); };

  const sidebar = (
    <div className="flex h-full flex-col gap-5 px-3 py-4">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
        <span className="grid size-7 place-items-center rounded-lg bg-fg text-bg"><Sparkles className="size-3.5" /></span>
        <span className="text-[14px] font-semibold tracking-tight">{cfg?.brand || 'Recruit OS'}</span>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto">
        {NAV.map(g => (
          <div key={g.section}>
            <p className="mb-1 px-2 text-[11px] font-medium tracking-wide text-subtle uppercase">{g.section}</p>
            <ul className="space-y-0.5">
              {g.items.map(it => (
                <li key={it.href}>
                  <Link href={it.href} aria-current={isActive(it.href) ? 'page' : undefined}
                    className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors',
                      isActive(it.href) ? 'bg-surface font-medium text-fg shadow-card ring-1 ring-border' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
                    <it.icon className="size-4 shrink-0" />{it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-2">
        <VoiceStatus cfg={cfg} />
        <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-muted hover:bg-surface-2 hover:text-fg">
          <ExternalLink className="size-3.5" /> Open careers page
        </a>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-bg lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-bg shadow-pop">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-13 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur-md lg:px-8">
          <button className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <div className="flex-1" />
          <RecruiterPicker />
          <AssistantButton />
          <ThemeToggle />
          {me?.auth_required && (
            <button onClick={logout} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          )}
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export { api };
