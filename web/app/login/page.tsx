'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Eye, EyeOff, FileSearch, Lock, Mic, ShieldCheck } from 'lucide-react';
import { ApiError, post } from '@/lib/api';
import { PRODUCT } from '@/lib/brand';
import { safeNext } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Logo, LogoMark } from '@/components/brand/logo';

const message = (err: unknown) => {
  if (!(err instanceof ApiError)) return 'Could not reach the server. Check your connection and try again.';
  if (err.status === 401) return 'That password is not right. Passwords are case-sensitive.';
  if (err.status === 429) return err.message.replace(/^too many attempts/, 'Too many attempts') + '.';
  if (err.status === 403) return 'Sign-in is turned off on this address until an admin sets a dashboard password.';
  return err.message;
};

function LoginForm() {
  const next = safeNext(useSearchParams().get('next'));
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await post('/api/login', { password });
      // A full load starts the dashboard with a fresh cache and lets the server confirm the new session.
      window.location.assign(next);
    } catch (err) {
      setError(message(err)); setBusy(false);
    }
  };
  const onKey = (e: React.KeyboardEvent) => setCaps(e.getModifierState?.('CapsLock') ?? false);

  return (
    <form onSubmit={submit} className="w-full max-w-[360px]" noValidate>
      <Link href="/" className="mb-10 inline-flex lg:hidden"><Logo /></Link>
      <h1 className="text-[24px] font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 mb-7 text-[13.5px] text-muted">Sign in to review interviews, scores and your hiring pipeline.</p>
      <Field label="Dashboard password" error={error} help={!error && caps ? 'Caps Lock is on.' : undefined}>
        {(id, d) => (
          <div className="relative">
            <Input id={id} aria-describedby={d} aria-invalid={!!error} type={show ? 'text' : 'password'} autoFocus autoComplete="current-password"
              className="h-10 pr-10" value={password} onChange={e => { setPassword(e.target.value); setError(null); }} onKeyDown={onKey} onKeyUp={onKey} />
            <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-subtle hover:text-fg"
              aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        )}
      </Field>
      <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" loading={busy} disabled={!password}>
        {!busy && <Lock className="size-3.5" />} Sign in
      </Button>
      <p className="mt-4 text-[12px] leading-relaxed text-subtle">Your admin sets this password. You stay signed in on this device for 7 days.</p>
      <div className="mt-10 flex items-center justify-between border-t border-border pt-5 text-[12.5px]">
        <Link href="/" className="inline-flex items-center gap-1.5 text-muted hover:text-fg"><ArrowLeft className="size-3.5" />Back to site</Link>
        <Link href="/" className="inline-flex items-center gap-1 text-muted hover:text-fg">Applying for a job?<ArrowRight className="size-3.5" /></Link>
      </div>
    </form>
  );
}

const POINTS = [
  { icon: Mic, title: 'Every applicant interviewed', text: 'A six-minute voice interview starts the moment someone applies.' },
  { icon: FileSearch, title: 'Scores you can check', text: 'Each point on the 100-point rubric links back to what the candidate said.' },
  { icon: ShieldCheck, title: 'People make the call', text: 'The AI ranks and explains. Your team decides who moves forward.' },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="relative hidden overflow-hidden bg-[#0f0d1a] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_10%,rgb(99_102_241/0.45),transparent),radial-gradient(50%_40%_at_90%_90%,rgb(168_85_247/0.25),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:40px_40px]" />
        <Link href="/" className="relative inline-flex items-center gap-2.5">
          <LogoMark className="bg-white text-[#0f0d1a]" /><span className="text-[15px] font-semibold tracking-tight">{PRODUCT}</span>
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-[30px] leading-[1.15] font-semibold tracking-tight">Interview every applicant.<br /><span className="text-white/60">Review only the best.</span></h2>
          <ul className="mt-9 space-y-5">
            {POINTS.map(p => (
              <li key={p.title} className="flex gap-3.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15"><p.icon className="size-4" /></span>
                <div><p className="text-[14px] font-medium">{p.title}</p><p className="mt-0.5 text-[13px] text-white/60">{p.text}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-white/40">Candidate data stays on your server. Sessions are signed and expire.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <Suspense><LoginForm /></Suspense>
      </section>
    </main>
  );
}
