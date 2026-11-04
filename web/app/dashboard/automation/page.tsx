'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Bot, Play, RotateCcw, Workflow } from 'lucide-react';
import { post, useApi } from '@/lib/api';
import { fmtRelative, titleCase } from '@/lib/utils';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/form';

type Task = { id: string; kind: string; candidate_name: string | null; status: 'pending' | 'running' | 'done' | 'failed'; attempts: number; result: string | null; run_at: string; created_at: string };
type Llm = { chain: { name: string; model: string }[]; providers: { name: string; configured: boolean; needs: string; model: string }[]; calls_today: number; cap: number; cached_today: number };
const TONE = { pending: 'neutral', running: 'accent', done: 'success', failed: 'danger' } as const;

export default function AutomationPage() {
  const { data: s, mutate } = useApi<Record<string, string>>('/api/settings');
  const { data: tasks, mutate: mTasks } = useApi<Task[]>('/api/tasks', 5000);
  const { data: llm } = useApi<Llm>('/api/llm/status', 30000);
  const [busy, setBusy] = useState(false);

  const save = async (patch: Record<string, string | boolean>) => {
    await mutate(x => ({ ...x, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? '1' : '0') : v])) }), { revalidate: false });
    try { await post('/api/settings', patch); toast.success('Saved'); } catch (e: any) { toast.error(e.message); mutate(); }
  };
  const runNow = async () => { setBusy(true); try { await post('/api/tasks/run'); mTasks(); toast.success('Queue processed'); } catch (e: any) { toast.error(e.message); } setBusy(false); };
  const num = (k: string) => ({ value: s?.[k] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => mutate(x => ({ ...x, [k]: e.target.value }), { revalidate: false }), onBlur: (e: React.FocusEvent<HTMLInputElement>) => save({ [k]: e.target.value }) });

  return (
    <>
      <PageHeader title="Automation" description="What the system does on its own, and the background queue that does it. Every automated step can be retried." />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Rules" />
            <CardBody className="space-y-5">
              {!s ? <Skeleton className="h-40" /> : (<>
                <Switch checked={s.auto_call === '1'} onChange={v => save({ auto_call: v })} label="Phone new applicants automatically" description="One minute after applying, if they consented and the number is allowed." />
                <Switch checked={s.auto_analyze === '1'} onChange={v => save({ auto_analyze: v })} label="AI analysis after every interview" description="A second opinion from the LLM next to the rule-based score." />
                <Switch checked={s.auto_draft_messages === '1'} onChange={v => save({ auto_draft_messages: v })} label="Draft follow-up messages" description="Shortlist and rejection drafts for you to review and send." />
                <Field label="Fairness spot-check rate" help="Share of AI rejects sent to a human for review instead (0 to 1).">{id => <Input id={id} type="number" step="0.05" min={0} max={1} {...num('spot_check_rate')} />}</Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Workday from">{id => <Input id={id} type="number" min={0} max={22} {...num('workday_start')} />}</Field>
                  <Field label="to">{id => <Input id={id} type="number" min={1} max={23} {...num('workday_end')} />}</Field>
                  <Field label="Slot (min)">{id => <Input id={id} type="number" min={15} max={120} {...num('slot_minutes')} />}</Field>
                </div>
                <Field label="Reminder before interview (hours)">{id => <Input id={id} type="number" min={1} max={168} {...num('reminder_hours')} />}</Field>
              </>)}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-1.5"><Bot className="size-3.5" />AI writing providers</span>} description={llm ? `${llm.calls_today} of ${llm.cap} calls today · ${llm.cached_today} served from cache` : undefined} />
            <ul className="divide-y divide-border border-t border-border text-[13px]">
              {llm?.providers.map(p => (
                <li key={p.name} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="flex-1"><span className="font-medium">{titleCase(p.name)}</span> <span className="font-mono text-[11.5px] text-subtle">{p.model}</span></span>
                  {p.configured ? <Badge tone="success" dot>Active{llm.chain[0]?.name === p.name ? ' · first' : ''}</Badge> : <Badge>Needs {p.needs}</Badge>}
                </li>
              ))}
            </ul>
            <p className="px-5 py-3 text-[12px] text-muted">Tried in order, with a cache and a daily cap. With no key, every feature falls back to rules. Emails and phone numbers are removed from prompts.</p>
          </Card>
        </div>
        <Card className="lg:col-span-3">
          <CardHeader title="Background queue" description="Resume parsing, analyses, calls, reminders and drafts" action={<Button size="sm" onClick={runNow} loading={busy}><Play className="size-3.5" />Run due tasks now</Button>} />
          <div className="divide-y divide-border border-t border-border">
            {!tasks ? <Skeleton className="m-5 h-40" /> : !tasks.length ? <EmptyState icon={Workflow} title="The queue is empty" /> : tasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                <Badge tone={TONE[t.status]} dot>{titleCase(t.status)}</Badge>
                <div className="min-w-0 flex-1"><p className="truncate"><span className="font-medium">{titleCase(t.kind)}</span>{t.candidate_name && <span className="text-muted"> · {t.candidate_name}</span>}</p>{t.result && <p className="truncate text-[12px] text-subtle">{t.result}</p>}</div>
                <span className="text-[12px] text-subtle">{t.status === 'pending' ? `due ${fmtRelative(t.run_at).replace(' ago', '')}` : fmtRelative(t.created_at)}</span>
                {t.status === 'failed' && <Button size="sm" variant="ghost" onClick={async () => { await post(`/api/tasks/${t.id}/retry`); mTasks(); }}><RotateCcw className="size-3.5" />Retry</Button>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
