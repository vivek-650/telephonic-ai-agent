'use client';
// Typed interview, used when no voice engine is connected. Same questions, same scoring.
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot } from 'lucide-react';
import { post } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';

type Q = { key: string; ask: string };

export function Simulator({ screeningId, questions, context, onDone }: { screeningId: string; questions: Q[]; context: Record<string, string>; onDone: () => void }) {
  const [msgs, setMsgs] = useState<{ role: 'agent' | 'candidate'; text: string }[]>([]);
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const ask = (q: Q) => {
    if (q.key === 'relocation_ok' && context.job_location) return `This role is based in ${context.job_location}. You mentioned you are in ${context.candidate_city}. Can you work from there?`;
    if (q.key === 'years_experience' && context.form_years_experience) return `Your form says ${context.form_years_experience} years of experience. How many of those are directly relevant to ${context.job_title}?`;
    return q.ask;
  };
  useEffect(() => {
    setMsgs([{ role: 'agent', text: `Hi ${context.candidate_first_name}, I’m ${context.agent_name || 'the AI recruiter'}. I have ${questions.length} short questions about the ${context.job_title} role. Type your answers as you would say them.` }, { role: 'agent', text: ask(questions[0]) }]);
    // Runs once for this screening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), [msgs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim(); if (!v || busy) return;
    const a = { ...answers, [questions[i].key]: v };
    const next = [...msgs, { role: 'candidate' as const, text: v }];
    setAnswers(a); setValue('');
    if (i + 1 < questions.length) { setMsgs([...next, { role: 'agent', text: ask(questions[i + 1]) }]); setI(i + 1); return; }
    setMsgs([...next, { role: 'agent', text: 'That’s everything. Thank you, the hiring team will review this shortly.' }]);
    setBusy(true);
    try { await post(`/api/screenings/${screeningId}/complete`, { transcript: next, answers: a }); setTimeout(onDone, 900); } catch { setBusy(false); }
  };

  return (
    <div className="flex h-[min(560px,70dvh)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-medium"><Bot className="size-4 text-accent" />Typed interview <span className="ml-auto font-mono text-[12px] text-muted">{Math.min(i + 1, questions.length)} / {questions.length}</span></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.map((m, k) => (
          <p key={k} className={cn('animate-fade-in max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed', m.role === 'agent' ? 'rounded-tl-md bg-surface-2' : 'ml-auto rounded-tr-md bg-fg text-bg')}>{m.text}</p>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
        <Input value={value} onChange={e => setValue(e.target.value)} placeholder="Type your answer…" autoFocus disabled={busy} />
        <Button type="submit" variant="primary" size="icon" loading={busy} aria-label="Send"><ArrowUp className="size-4" /></Button>
      </form>
    </div>
  );
}
