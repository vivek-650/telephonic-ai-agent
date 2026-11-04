'use client';
// Which recruiter is using this browser. Stage moves, notes and AI feedback are attributed to them.
import { useEffect, useState } from 'react';

const KEY = 'recruiter_id';
const EVENT = 'recruiter:change';

export function useRecruiterId(): [string, (id: string) => void] {
  const [id, setId] = useState('');
  useEffect(() => {
    try { setId(localStorage.getItem(KEY) || ''); } catch { /* storage blocked */ }
    const on = (e: Event) => setId((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const set = (v: string) => {
    try { localStorage.setItem(KEY, v); } catch { /* storage blocked */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
  };
  return [id, set];
}
