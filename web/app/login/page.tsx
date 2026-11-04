'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Sparkles } from 'lucide-react';
import { ApiError, post } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/dashboard';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await post('/api/login', { password });
      router.replace(next.startsWith('/') ? next : '/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-7 shadow-pop">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-fg text-bg"><Sparkles className="size-4" /></span>
        <span className="text-[15px] font-semibold tracking-tight">Recruit OS</span>
      </div>
      <h1 className="text-[18px] font-semibold tracking-tight">Sign in to the dashboard</h1>
      <p className="mt-1 mb-5 text-[13px] text-muted">Candidate data is protected. Enter the dashboard password set by your admin.</p>
      <Field label="Password" error={error}>
        {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!error} type="password" autoFocus autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" loading={busy} disabled={!password}>
        <Lock className="size-3.5" /> Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_60%)] px-4">
      <Suspense><LoginForm /></Suspense>
    </main>
  );
}
