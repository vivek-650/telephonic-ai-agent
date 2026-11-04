'use client';
// Full-screen browser interview: the AI interviewer, a live transcript, a mic level meter, mute and end.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, ShieldCheck } from 'lucide-react';
import { DograhSession, type TranscriptEvent } from '@/lib/dograh-session';
import { cn, fmtDuration } from '@/lib/utils';

type Line = { role: 'agent' | 'candidate'; text: string; interim: string; closed?: boolean };
// Speech arrives in pieces: add a space between pieces unless the next one starts with punctuation.
const join = (a: string, b: string) => (!a ? b.trimStart() : /^[\s.,!?;:'’)\]]/.test(b) || /\s$/.test(a) ? a + b : `${a} ${b}`);

export function CallRoom({ api, token, context, iceServers, agentName, jobTitle, company, onEnd, onError }: {
  api: string; token: string; context: Record<string, unknown>; iceServers: RTCIceServer[];
  agentName: string; jobTitle: string; company?: string;
  onEnd: (seconds: number) => void; onError: (e: Error) => void;
}) {
  const [live, setLive] = useState(false);
  const [talking, setTalking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const session = useRef<DograhSession | null>(null);
  const t0 = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  const onTranscript = useCallback((ev: TranscriptEvent) => {
    if (!ev.text) return;
    setLines(prev => {
      const next = [...prev];
      let cur = next[next.length - 1];
      if (!cur || cur.role !== ev.role || cur.closed) {
        if (cur?.interim) next[next.length - 1] = { ...cur, text: join(cur.text, cur.interim), interim: '' };
        cur = { role: ev.role, text: '', interim: '' }; next.push(cur);
      }
      const updated = ev.role === 'agent' || ('final' in ev && ev.final) ? { ...cur, text: join(cur.text, ev.text), interim: '' } : { ...cur, interim: ev.text.trim() };
      next[next.length - 1] = updated;
      return next;
    });
  }, []);

  useEffect(() => {
    const s = new DograhSession({ api, token, context, iceServers }, {
      live: () => { t0.current = Date.now(); setLive(true); },
      speaking: on => { setTalking(on); if (!on) setLines(l => (l.length && l[l.length - 1].role === 'agent' ? [...l.slice(0, -1), { ...l[l.length - 1], closed: true }] : l)); },
      transcript: onTranscript,
      end: () => onEnd(t0.current ? Math.floor((Date.now() - t0.current) / 1000) : 0),
      error: onError,
    });
    session.current = s;
    s.start();
    return () => s.dispose();
    // The session lives for the lifetime of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!live) return; const i = setInterval(() => setSecs(Math.floor((Date.now() - t0.current) / 1000)), 1000); return () => clearInterval(i); }, [live]);

  // Microphone level meter, so the candidate can see they are being heard.
  useEffect(() => {
    if (!live || !session.current?.stream) return;
    let raf = 0; const ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 512;
    ac.createMediaStreamSource(session.current.stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => { an.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2; setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4)); raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); ac.close().catch(() => {}); };
  }, [live]);

  useEffect(() => { const el = scroller.current; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight; }, [lines]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (live) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('beforeunload', warn); document.body.style.overflow = ''; };
  }, [live]);

  const toggleMute = () => { const m = !muted; setMuted(m); session.current?.setMuted(m); };
  const end = () => { if (!live || confirm('End the interview now? What you have said so far is still sent to the recruiter.')) session.current?.hangUp(); };
  const status = !live ? 'Connecting…' : talking ? `${agentName} is speaking` : muted ? 'You are muted' : 'Listening';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0c0a09] text-stone-100" role="dialog" aria-modal aria-label="AI interview">
      <header className="flex items-center gap-3 px-5 py-4 sm:px-8">
        <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-red-400"><span className="size-1.5 animate-pulse rounded-full bg-red-500" />REC</span>
        <div className="min-w-0"><p className="truncate text-[13.5px] font-medium">{jobTitle}</p>{company && <p className="truncate text-[12px] text-stone-400">{company}</p>}</div>
        <span className="ml-auto font-mono text-[13px] tabular-nums text-stone-300">{fmtDuration(secs)}</span>
      </header>

      <div className="grid min-h-0 flex-1 gap-6 px-5 pb-4 sm:px-8 lg:grid-cols-[1fr_420px]">
        <section className="flex flex-col items-center justify-center gap-6">
          <div className="relative grid size-40 place-items-center">
            {talking && <><span className="animate-pulse-ring absolute inset-0 rounded-full bg-indigo-400/30" /><span className="animate-pulse-ring absolute inset-0 rounded-full bg-indigo-400/20 [animation-delay:.5s]" /></>}
            <span className={cn('relative grid size-32 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 text-[44px] font-semibold shadow-2xl shadow-indigo-900/40 transition-transform duration-300', talking && 'scale-105')}>{agentName[0]?.toUpperCase()}</span>
          </div>
          <div className="text-center">
            <p className="text-[20px] font-semibold tracking-tight">{agentName}</p>
            <p className="mt-1 text-[13px] text-stone-400">AI recruiter · {status}</p>
          </div>
          <div className="flex w-48 items-center gap-2" aria-label="Your microphone level">
            {muted ? <MicOff className="size-3.5 text-stone-500" /> : <Mic className="size-3.5 text-stone-400" />}
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-800"><div className="h-full rounded-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${muted ? 0 : level * 100}%` }} /></div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-stone-800 bg-stone-900/60 max-lg:max-h-[38dvh]">
          <p className="border-b border-stone-800 px-4 py-2.5 text-[11.5px] font-medium tracking-wide text-stone-400 uppercase">Live transcript</p>
          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {!lines.length && <p className="pt-8 text-center text-[13px] text-stone-500">What you and {agentName} say appears here.</p>}
            {lines.map((l, i) => (
              <div key={i} className={cn('flex flex-col gap-1', l.role === 'candidate' && 'items-end')}>
                <span className="text-[11px] text-stone-500">{l.role === 'agent' ? agentName : 'You'}</span>
                <p className={cn('max-w-[88%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed', l.role === 'agent' ? 'rounded-tl-md bg-stone-800' : 'rounded-tr-md bg-indigo-500 text-white')}>
                  {l.text}{l.interim && <span className="opacity-60">{l.text ? ' ' : ''}{l.interim}</span>}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="flex flex-col items-center gap-3 px-5 pt-2 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={toggleMute} aria-pressed={muted} className={cn('grid size-14 place-items-center rounded-full transition-colors', muted ? 'bg-stone-100 text-stone-900' : 'bg-stone-800 text-stone-100 hover:bg-stone-700')} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>
          <button onClick={end} className="grid size-14 place-items-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500" aria-label="End interview"><PhoneOff className="size-5" /></button>
        </div>
        <p className="flex items-center gap-1.5 text-[11.5px] text-stone-500"><ShieldCheck className="size-3.5" />Recorded and transcribed for the hiring team only</p>
      </footer>
    </div>
  );
}
