'use client';
// "Ask about your pipeline": answered from live pipeline data by the LLM router, or by rules when no key is set.
import { useState } from 'react';
import { MessageSquareText, ArrowUp } from 'lucide-react';
import { post } from '@/lib/api';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';

const SUGGESTIONS = ['Who are the top 3 candidates?', 'Who was rejected and why?', 'Which role needs more applicants?'];

export function AssistantButton() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ q: string; a: string; provider: string }[]>([]);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true); setQ('');
    try {
      const r = await post<{ answer: string; provider: string }>('/api/assistant', { question });
      setLog(l => [...l, { q: question, a: r.answer, provider: r.provider }]);
    } catch (e: any) { setLog(l => [...l, { q: question, a: e.message, provider: 'error' }]); }
    setBusy(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-muted shadow-card hover:text-fg">
        <MessageSquareText className="size-3.5" /><span className="hidden md:inline">Ask about your pipeline</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Pipeline assistant" description="Answers come only from your live pipeline data. A recruiter always makes the decision.">
        <div className="space-y-4">
          {log.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => <button key={s} onClick={() => ask(s)} className="rounded-full border border-border px-3 py-1 text-[12.5px] text-muted hover:bg-surface-2 hover:text-fg">{s}</button>)}
            </div>
          )}
          {log.map((m, i) => (
            <div key={i} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-fg px-3 py-2 text-[13px] text-bg">{m.q}</p>
              <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-border bg-surface-2 px-3 py-2 text-[13px]">
                {m.a}
                <div className="mt-1.5"><Badge>{m.provider === 'rules' ? 'Rules (no AI key)' : m.provider}</Badge></div>
              </div>
            </div>
          ))}
          <form onSubmit={e => { e.preventDefault(); ask(q); }} className="flex gap-2">
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask anything about candidates and roles…" autoFocus />
            <Button type="submit" variant="primary" size="icon" loading={busy} aria-label="Ask"><ArrowUp className="size-4" /></Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
