'use client';
// Engine room: read-only view of how an interview is put together and what crossed the wire. Keys are masked server side.
import { useState } from 'react';
import { toast } from 'sonner';
import { Activity, ArrowDownLeft, ArrowUpRight, Cpu, FlaskConical } from 'lucide-react';
import { post, useApi } from '@/lib/api';
import { fmtRelative, titleCase } from '@/lib/utils';
import { Badge, Card, CardBody, CardHeader, DefinitionList, EmptyState, PageHeader, Skeleton, Tabs } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';

type Overview = { dograh: Record<string, string | boolean>; counts: Record<string, number>; prompts: Record<string, string> };
type Trace = { trace: ({ at: string; kind: string } & Record<string, unknown>)[]; events: { id: number; at: string; kind: string; detail: string; name: string | null }[] };
type Preview = { stage_2_compaction: { gaps: unknown[]; skills: string[]; probes: string[]; summary: string }; stage_3_initial_context: Record<string, string>; stage_4_dograh_request: unknown; stage_5_agent_prompt_rendered: string };

const Code = ({ children }: { children: React.ReactNode }) => <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-surface-2/60 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">{children}</pre>;

export default function EnginePage() {
  const { data: o } = useApi<Overview>('/api/engine/overview', 30000);
  const { data: t } = useApi<Trace>('/api/engine/trace', 4000);
  const [prompt, setPrompt] = useState('screener');
  const [resume, setResume] = useState('Sales Executive, Acme Corp 2019-2021. Team Lead, Beta Ltd 2023-Present. Skills: CRM, Salesforce, cold calling.');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { setPreview(await post<Preview>('/api/engine/preview', { resume_text: resume })); } catch (e: any) { toast.error(e.message); } setBusy(false); };

  return (
    <>
      <PageHeader title="Engine room" description="How each AI interview is assembled, and a live trace of everything sent to and received from the voice engine." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><Cpu className="size-3.5" />Voice engine wiring</span>} />
          <CardBody>{!o ? <Skeleton className="h-48" /> : <DefinitionList items={Object.entries(o.dograh).map(([k, v]) => [titleCase(k), typeof v === 'boolean' ? <Badge tone={v ? 'success' : 'neutral'} dot>{v ? 'Yes' : 'No'}</Badge> : <span className="font-mono text-[12px]">{String(v)}</span>])} />}</CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={<span className="flex items-center gap-1.5"><Activity className="size-3.5" />Live trace</span>} description="Outgoing calls, incoming webhooks and agent syncs (last 100, in memory)" />
          <div className="max-h-[360px] divide-y divide-border overflow-y-auto border-t border-border">
            {!t ? <Skeleton className="m-5 h-40" /> : !t.trace.length ? <EmptyState title="Nothing traced yet" description="Start an interview and watch it appear here." className="py-10" /> : t.trace.map((x, i) => {
              const out = /out|sync/.test(x.kind);
              const { at, kind, ...rest } = x;
              return (
                <details key={i} className="group px-5 py-2.5">
                  <summary className="flex cursor-pointer list-none items-center gap-2.5 text-[13px]">
                    {out ? <ArrowUpRight className="size-3.5 text-accent" /> : <ArrowDownLeft className="size-3.5 text-success" />}
                    <span className="font-medium">{titleCase(kind)}</span>
                    {'ok' in rest && <Badge tone={rest.ok ? 'success' : 'danger'}>{rest.ok ? 'ok' : 'failed'}</Badge>}
                    <span className="ml-auto text-[12px] text-subtle">{fmtRelative(at)}</span>
                  </summary>
                  <div className="mt-2"><Code>{JSON.stringify(rest, null, 2)}</Code></div>
                </details>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={<span className="flex items-center gap-1.5"><FlaskConical className="size-3.5" />Interview builder preview</span>} description="Paste a resume to see exactly what the AI interviewer receives: compaction, probes, context variables and the rendered prompt."
          action={<Button size="sm" variant="primary" onClick={run} loading={busy}>Build</Button>} />
        <CardBody className="space-y-4">
          <Textarea value={resume} onChange={e => setResume(e.target.value)} className="min-h-24 font-mono text-[12px]" />
          {preview && (
            <div className="grid animate-fade-in gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-[12.5px] font-medium">Resume compaction</p>
                <p className="text-[13px] text-muted">{preview.stage_2_compaction.summary || 'No timeline found'}</p>
                <div className="flex flex-wrap gap-1.5">{preview.stage_2_compaction.skills.map(s => <Badge key={s}>{s}</Badge>)}</div>
                <p className="text-[12.5px] font-medium">Questions the AI will probe</p>
                <ul className="list-disc space-y-1 pl-5 text-[13px]">{preview.stage_2_compaction.probes.map(p => <li key={p}>{p}</li>)}</ul>
                <p className="text-[12.5px] font-medium">Context variables</p>
                <Code>{JSON.stringify(preview.stage_3_initial_context, null, 2)}</Code>
              </div>
              <div className="space-y-2"><p className="text-[12.5px] font-medium">Rendered agent prompt</p><Code>{preview.stage_5_agent_prompt_rendered}</Code></div>
            </div>
          )}
        </CardBody>
      </Card>

      {o && (
        <Card className="mt-4">
          <CardHeader title="Agent prompts" description="The instructions each voice agent runs with (source: dograh/ folder)" />
          <CardBody>
            <Tabs value={prompt} onChange={setPrompt} className="mb-3" items={Object.keys(o.prompts).filter(k => o.prompts[k]).map(k => ({ id: k, label: titleCase(k) }))} />
            <Code>{o.prompts[prompt]}</Code>
          </CardBody>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader title="Event feed" description="Latest candidate events from the database" />
        <ul className="max-h-80 divide-y divide-border overflow-y-auto border-t border-border text-[12.5px]">
          {t?.events.map(e => <li key={e.id} className="flex gap-3 px-5 py-2"><Badge>{titleCase(e.kind)}</Badge><span className="min-w-0 flex-1 truncate">{e.name && <b className="font-medium">{e.name}: </b>}{e.detail}</span><span className="text-subtle">{fmtRelative(e.at)}</span></li>)}
        </ul>
      </Card>
    </>
  );
}
