'use client';
// After applying: get ready, run the interview (browser voice, phone fallback or typed), then confirm.
import { useState } from 'react';
import { CheckCircle2, Headphones, Mic, PhoneIncoming, RotateCcw, Volume2, Wifi } from 'lucide-react';
import { post } from '@/lib/api';
import type { Config } from '@/lib/types';
import { fmtDuration } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { CallRoom } from './call-room';
import { Simulator } from './simulator';

type Mode = 'web' | 'phone' | 'simulator';
type State = { step: 'ready' } | { step: 'starting' } | { step: 'live'; ice: RTCIceServer[] } | { step: 'phone' } | { step: 'typed'; sid: string; questions: { key: string; ask: string }[] } | { step: 'done'; secs?: number } | { step: 'failed'; message: string };

const micError = (m: string) => /permission|notallowed|denied|notfound|microphone/i.test(m);

export function InterviewStage({ cfg, candidateId, context }: { cfg: Config; candidateId: string; context: Record<string, string> }) {
  const mode: Mode = cfg.dograh_web ? 'web' : cfg.dograh_phone ? 'phone' : 'simulator';
  const [state, setState] = useState<State>({ step: 'ready' });
  const agent = context.agent_name || cfg.agent_name || 'Priya';

  const begin = async (m: Mode = mode) => {
    setState({ step: 'starting' });
    try {
      const s = await post<{ screening_id: string; questions?: { key: string; ask: string }[] }>(`/api/candidates/${candidateId}/screenings`, { mode: m });
      if (m === 'simulator') return setState({ step: 'typed', sid: s.screening_id, questions: s.questions || [] });
      if (m === 'phone') return setState({ step: 'phone' });
      // A public relay lets candidates outside the recruiter's network connect (empty when not configured).
      const relay = await post<{ ice_servers: RTCIceServer[] }>('/api/public/ice', { candidate_id: candidateId }).catch(() => ({ ice_servers: [] }));
      setState({ step: 'live', ice: relay.ice_servers || [] });
    } catch (e: any) { setState({ step: 'failed', message: e.message }); }
  };

  if (state.step === 'live') return (
    <CallRoom api={`${location.origin}/dograh`} token={cfg.embed_token || ''} iceServers={state.ice} agentName={agent} jobTitle={context.job_title} company={context.company_name}
      context={{ ...context, source: 'web', interview_mode: 'web' }}
      onEnd={secs => setState(secs ? { step: 'done', secs } : { step: 'failed', message: 'The interview ended before it started. You can start it again whenever you are ready.' })}
      onError={e => setState({ step: 'failed', message: micError(`${e.message} ${e.name}`) ? 'We could not use your microphone. Allow microphone access for this site (the icon in the address bar), then try again.' : e.message })} />
  );

  if (state.step === 'typed') return <Simulator screeningId={state.sid} questions={state.questions} context={{ ...context, agent_name: agent }} onDone={() => setState({ step: 'done' })} />;

  if (state.step === 'done') return (
    <Card className="animate-fade-in p-8 text-center">
      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-6" /></span>
      <h2 className="text-[20px] font-semibold tracking-tight">Interview complete</h2>
      <p className="mx-auto mt-2 max-w-sm text-[13.5px] text-muted">{state.secs ? `Thanks, ${context.candidate_first_name}. Your interview lasted ${fmtDuration(state.secs)}.` : `Thanks, ${context.candidate_first_name}.`} A person on the hiring team will review it and get back to you by email or WhatsApp.</p>
    </Card>
  );

  if (state.step === 'phone') return (
    <Card className="animate-fade-in p-8 text-center">
      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-accent-soft text-accent"><PhoneIncoming className="size-6" /></span>
      <h2 className="text-[20px] font-semibold tracking-tight">Calling you now</h2>
      <p className="mx-auto mt-2 max-w-sm text-[13.5px] text-muted">Pick up and {agent} will introduce themselves. The call takes about six minutes. You can close this page.</p>
    </Card>
  );

  return (
    <Card className="animate-fade-in overflow-hidden">
      <div className="border-b border-border bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_70%)] px-8 pt-8 pb-6 text-center">
        <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 text-[24px] font-semibold text-white shadow-lg">{agent[0]}</span>
        <h2 className="text-[20px] font-semibold tracking-tight">{state.step === 'failed' ? 'Your interview didn’t start' : `Meet ${agent}, your AI recruiter`}</h2>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] text-muted">
          {state.step === 'failed' ? 'Your application is saved. Fix the issue below and start again.' : mode === 'web' ? `${agent} will ask about your experience and the role in a short voice conversation, right here in your browser.` : mode === 'phone' ? `${agent} will call your phone for a short conversation about the role.` : 'Answer a few short questions about the role by typing.'}
        </p>
      </div>
      <div className="space-y-5 p-6">
        {state.step === 'failed' && <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-[13px] text-danger">{state.message}</p>}
        {mode === 'web' && (
          <ul className="grid gap-3 sm:grid-cols-3">
            {[[Headphones, 'Use headphones', 'So the AI does not hear itself'], [Volume2, 'Find a quiet spot', 'About 6 minutes'], [Wifi, 'Allow the microphone', 'Your browser will ask']].map(([Icon, t, d]: any) => (
              <li key={t} className="flex gap-2.5 rounded-lg bg-surface-2/60 p-3"><Icon className="mt-0.5 size-4 shrink-0 text-muted" /><div><p className="text-[12.5px] font-medium">{t}</p><p className="text-[11.5px] text-muted">{d}</p></div></li>
            ))}
          </ul>
        )}
        <div className="flex flex-col items-center gap-2">
          <Button variant="primary" size="lg" onClick={() => begin()} loading={state.step === 'starting'} className="w-full sm:w-auto sm:min-w-56">
            {state.step === 'failed' ? <><RotateCcw className="size-4" />Try again</> : mode === 'simulator' ? 'Start the interview' : mode === 'phone' ? <><PhoneIncoming className="size-4" />Call me now</> : <><Mic className="size-4" />Start the interview</>}
          </Button>
          {mode === 'web' && cfg.dograh_phone && <button onClick={() => begin('phone')} className="text-[12.5px] text-muted hover:text-fg">Prefer a phone call instead?</button>}
        </div>
      </div>
    </Card>
  );
}
