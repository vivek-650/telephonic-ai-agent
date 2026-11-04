'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, Lock, PhoneOutgoing, Square, UploadCloud } from 'lucide-react';
import { del, post, useApi } from '@/lib/api';
import type { Job } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';

type Result = { source: string; created: number; skipped: number; notDialable: number; columns: Record<string, string>; problems: { line: number; name?: string; reason: string }[] };
type Batch = { source: string; total: number; dialable: number; called: number };
type Queue = { waiting: number; running: boolean; recent: { name: string; at: string; ok: boolean; note: string }[] };

export default function ImportPage() {
  const { data: jobs } = useApi<Job[]>('/api/jobs');
  const { data: batches, mutate: mBatches } = useApi<Batch[]>('/api/import/batches', 8000);
  const { data: queue, mutate: mQueue } = useApi<Queue>('/api/import/queue', 3000);
  const { data: app } = useApi<{ calls_locked: boolean }>('/api/app-settings');
  const [job, setJob] = useState('');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [drag, setDrag] = useState(false);
  const [calling, setCalling] = useState<Batch | null>(null);
  const [opts, setOpts] = useState({ limit: 5, gap: 180, force: false });
  const input = useRef<HTMLInputElement>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    if (f.size > 900_000) return toast.error('That file is over 900 KB. Split it into smaller files.');
    setFile({ name: f.name, text: await f.text() }); setLabel(l => l || f.name.replace(/\.[^.]+$/, '')); setResult(null);
  };
  const upload = async () => {
    setBusy(true);
    try { const r = await post<Result>('/api/import/csv', { job_id: job, csv: file?.text, label }); setResult(r); toast.success(`${r.created} leads imported`); mBatches(); } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  const startCalls = async () => {
    if (!calling) return;
    try {
      const r = await post<{ queued: number; skippedNotDialable: number; skippedLocked: number }>('/api/import/call', { source: calling.source, confirm: true, limit: opts.limit, gap_seconds: opts.gap, force: opts.force });
      toast.success(`${r.queued} calls queued${r.skippedLocked ? `, ${r.skippedLocked} locked by the allowlist` : ''}`); setCalling(null); mQueue();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <>
      <PageHeader title="Import leads" description="Drop an export from Naukri, Indeed, LinkedIn or any spreadsheet. Columns are matched by name and duplicates are skipped." />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="1. Upload" description="CSV with at least a name and a phone column" />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Import into role" required>{id => <Select id={id} value={job} onChange={e => setJob(e.target.value)}><option value="">Choose a role…</option>{jobs?.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}</Select>}</Field>
              <Field label="Batch label" help="So you can find and call this batch later">{id => <Input id={id} value={label} onChange={e => setLabel(e.target.value)} placeholder="naukri-november" />}</Field>
            </div>
            <button type="button" onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
              className={cn('flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors', drag ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong hover:bg-surface-2/50')}>
              {file ? <FileSpreadsheet className="mb-2 size-7 text-accent" /> : <UploadCloud className="mb-2 size-7 text-subtle" />}
              <p className="text-[13.5px] font-medium">{file ? file.name : 'Drop a CSV here, or click to choose'}</p>
              <p className="mt-1 text-[12px] text-muted">{file ? `${file.text.split('\n').length - 1} rows` : 'Up to 900 KB'}</p>
            </button>
            <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={e => pick(e.target.files?.[0])} />
            <div className="flex justify-end"><Button variant="primary" onClick={upload} loading={busy} disabled={!job || !file}>Import leads</Button></div>
            {result && (
              <div className="animate-fade-in space-y-3 rounded-xl border border-border bg-surface-2/40 p-4">
                <div className="flex flex-wrap gap-2"><Badge tone="success">{result.created} imported</Badge><Badge>{result.skipped} skipped</Badge>{result.notDialable > 0 && <Badge tone="warning">{result.notDialable} not dialable</Badge>}</div>
                <p className="text-[12px] text-muted">Columns matched: {Object.entries(result.columns || {}).map(([k, v]) => `${k} ← “${v}”`).join(', ')}</p>
                {result.problems.length > 0 && <ul className="max-h-40 space-y-1 overflow-y-auto text-[12px] text-muted">{result.problems.map(p => <li key={p.line}>Row {p.line}{p.name ? ` (${p.name})` : ''}: {p.reason}</li>)}</ul>}
              </div>
            )}
          </CardBody>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="2. AI calls" description="The AI phones each lead and interviews them" />
            {app?.calls_locked && <div className="mx-5 mb-3 flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[12px] text-warning"><Lock className="mt-0.5 size-3.5 shrink-0" />Safety lock on: only numbers on the allowlist are called. Change this in Settings.</div>}
            <ul className="divide-y divide-border border-t border-border">
              {!batches?.length && <EmptyState title="No imported batches yet" className="py-8" />}
              {batches?.map(b => (
                <li key={b.source} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{b.source.replace(/^csv:/, '')}</p><p className="text-[12px] text-muted">{b.total} leads · {b.dialable} dialable · {b.called} called</p></div>
                  <Button size="sm" onClick={() => setCalling(b)} disabled={b.called >= b.dialable}><PhoneOutgoing className="size-3.5" />Call</Button>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Call queue" description={queue ? `${queue.waiting} waiting${queue.running ? ' · calling now' : ''}` : '…'}
              action={queue?.waiting ? <Button size="sm" variant="ghost" onClick={async () => { const r = await del<{ cancelled: number }>('/api/import/queue'); toast.success(`${r.cancelled} calls cancelled`); mQueue(); }}><Square className="size-3" />Stop</Button> : null} />
            <ul className="space-y-1.5 px-5 pb-4 text-[12.5px]">
              {!queue?.recent?.length && <li className="text-subtle">Nothing called yet</li>}
              {queue?.recent?.map((r, i) => <li key={i} className="flex gap-2"><span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', r.ok ? 'bg-success' : 'bg-danger')} /><span className="min-w-0"><b className="font-medium">{r.name}</b> <span className="text-muted">{r.note}</span></span></li>)}
            </ul>
          </Card>
        </div>
      </div>
      <Dialog open={!!calling} onClose={() => setCalling(null)} title={`Call ${calling?.source.replace(/^csv:/, '')}`} description="Each lead gets one AI phone interview. Calls go out one at a time."
        footer={<><Button variant="ghost" onClick={() => setCalling(null)}>Cancel</Button><Button variant="primary" onClick={startCalls}><PhoneOutgoing className="size-3.5" />Start calls</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="How many">{id => <Input id={id} type="number" min={1} max={200} value={opts.limit} onChange={e => setOpts({ ...opts, limit: Number(e.target.value) })} />}</Field>
            <Field label="Seconds between calls">{id => <Input id={id} type="number" min={30} max={900} value={opts.gap} onChange={e => setOpts({ ...opts, gap: Number(e.target.value) })} />}</Field>
          </div>
          <Checkbox checked={opts.force} onChange={v => setOpts({ ...opts, force: v })}>Ignore calling hours (9 AM to 7 PM IST). Only for demos.</Checkbox>
        </div>
      </Dialog>
    </>
  );
}
