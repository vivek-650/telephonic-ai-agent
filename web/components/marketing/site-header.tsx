'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#scoring', label: 'Scoring' },
  { href: '#trust', label: 'Trust' },
  { href: '#faq', label: 'FAQ' },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <header className={cn('sticky top-0 z-40 transition-[background,border,box-shadow] duration-200', scrolled || open ? 'border-b border-border bg-bg/85 backdrop-blur-md' : 'border-b border-transparent')}>
      <div className="mx-auto flex h-15 max-w-6xl items-center gap-8 px-5">
        <Link href="/" aria-label="Home"><Logo /></Link>
        <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
          {LINKS.map(l => <a key={l.href} href={l.href} className="text-[13.5px] text-muted transition-colors hover:text-fg">{l.label}</a>)}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link href="/careers" className="px-2 text-[13.5px] text-muted transition-colors hover:text-fg">Careers</Link>
          <ButtonLink href="/login" variant="ghost">Sign in</ButtonLink>
          <ButtonLink href="/dashboard" variant="primary">Open dashboard<ArrowRight className="size-3.5" /></ButtonLink>
        </div>
        <button className="ml-auto grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 md:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <nav aria-label="Mobile" className="border-t border-border px-5 pt-3 pb-5 md:hidden">
          <ul className="grid gap-1">
            {[...LINKS, { href: '/careers', label: 'Careers' }, { href: '/login', label: 'Sign in' }].map(l => (
              <li key={l.href}><a href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-[14px] text-muted hover:bg-surface-2 hover:text-fg">{l.label}</a></li>
            ))}
          </ul>
          <ButtonLink href="/dashboard" variant="primary" size="lg" className="mt-3 w-full">Open dashboard<ArrowRight className="size-4" /></ButtonLink>
        </nav>
      )}
    </header>
  );
}
