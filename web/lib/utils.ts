import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Stage, Verdict } from './types';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// Database times are UTC "YYYY-MM-DD HH:MM:SS"; ISO strings pass through.
export const toDate = (s?: string | null) => (s ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z') : null);

const IST = { timeZone: 'Asia/Kolkata' } as const;
export const fmtDate = (s?: string | null) => toDate(s)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...IST }) ?? '—';
export const fmtDateTime = (s?: string | null) => toDate(s)?.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...IST }) ?? '—';
export function fmtRelative(s?: string | null) {
  const d = toDate(s); if (!d) return '—';
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 7 * 86400) return `${Math.floor(sec / 86400)}d ago`;
  return fmtDate(s);
}
export const fmtDuration = (sec?: number | null) => (sec == null || sec < 0 ? '—' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
export const fmtMoney = (n?: number | null) => (n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);
export const fmtLpa = (monthly?: number | null) => (monthly == null ? '—' : `${(monthly * 12 / 100000).toFixed(1).replace(/\.0$/, '')} LPA`);
export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
export const maskPhone = (p = '') => (p.length > 6 ? `${p.slice(0, 3)} ••••• ••${p.slice(-2)}` : p);
export const titleCase = (s = '') => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'applied', label: 'Applied' }, { id: 'screening', label: 'Screening' }, { id: 'review', label: 'Review' },
  { id: 'shortlisted', label: 'Shortlisted' }, { id: 'interview', label: 'Interview' }, { id: 'hired', label: 'Hired' }, { id: 'rejected', label: 'Rejected' },
];
export const stageLabel = (s: Stage) => STAGES.find(x => x.id === s)?.label ?? s;

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export const verdictTone = (v?: Verdict | null): Tone => (v === 'Strong' ? 'success' : v === 'Maybe' ? 'warning' : v === 'Reject' ? 'danger' : 'neutral');
export const stageTone = (s: Stage): Tone => (s === 'hired' || s === 'shortlisted' ? 'success' : s === 'rejected' ? 'danger' : s === 'review' ? 'warning' : s === 'interview' ? 'accent' : 'neutral');
export const scoreTone = (n?: number | null): Tone => (n == null ? 'neutral' : n >= 75 ? 'success' : n >= 55 ? 'warning' : 'danger');

// Same rule as safeNextPath in lib/session.js: only same-site paths, never "//host" or "/\host".
export const safeNext = (raw?: string | null, fallback = '/dashboard') => (raw && /^\/(?![/\\])/.test(raw) && !/[\u0000-\u001f]/.test(raw) ? raw : fallback);
