'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, KeyRound, Lock, PlugZap, Ruler, ShieldAlert, XCircle } from 'lucide-react';
import { post, put, useApi } from '@/lib/api';
import type { Config } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge, Card, CardBody, CardHeader, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';

type FieldDef = { key: string; group: string; label: string; type: 'text' | 'secret' | 'number' | 'toggle' | 'select' | 'textarea'; help: string; placeholder: string; options: [string, string][] | null; is_set: boolean; source: 'settings' | 'environment' | 'unset'; value?: string; hint?: string };
type AppSettings = { groups: { id: string; title: string; help: string }[]; fields: FieldDef[]; can_manage: boolean; password_set: boolean; phone_ready: boolean; mail_ready: boolean; calls_locked: boolean; mail_locked: boolean; caps: { reachable: boolean; version: string | null; voice_override: boolean } };

function Rubric() {
  const { data: cfg } = useApi<Config>('/api/config');
  return (
    <Card>
      <CardHeader title="Scoring rubric" description="100 points, applied the same way to every candidate. Rubric changes are versioned and every score is audited." />
      <CardBody className="space-y-4">
        {cfg?.criteria.map(c => (
          <div key={c.label} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <p className="text-[13px] font-medium">{c.label}</p><span className="font-mono text-[12px] text-muted tabular-nums">{c.max} pts</span>
            <p className="col-span-2 text-[12.5px] text-muted">{c.rule}</p>
          </div>
        ))}
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-[12.5px] font-medium">Questions the AI always covers</p>
          <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-muted">{cfg?.questions.map(q => <li key={q.key}>{q.ask}</li>)}</ol>
        </div>
      </CardBody>
    </Card>
  );
}

function VoiceTools({ s }: { s: AppSettings }) {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (name: string, fn: () => Promise<any>) => {
    setBusy(name);
    try { const r = await fn(); r?.ok === false ? toast.error(r.message) : toast.success(r?.message || 'Done'); } catch (e: any) { toast.error(e.message); }
    setBusy(null);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2/40 p-3">
      <Badge tone={s.caps.reachable ? 'success' : 'danger'} dot>{s.caps.reachable ? `Dograh ${s.caps.version || ''} reachable` : 'Dograh unreachable'}</Badge>
      <Badge tone={s.phone_ready ? 'success' : 'neutral'}>{s.phone_ready ? 'Phone ready' : 'Phone not set up'}</Badge>
      <div className="flex-1" />
      <Button size="sm" onClick={() => act('test', () => post('/api/app-settings/test', { what: 'dograh' }))} loading={busy === 'test'}><PlugZap className="size-3.5" />Test connection</Button>
      <Button size="sm" onClick={() => act('agents', async () => { const r = await post<{ agents: { agent: string; status: string }[] }>('/api/app-settings/create-agents', {}); return { message: r.agents.map(a => `${a.agent}: ${a.status}`).join(' · ') }; })} loading={busy === 'agents'}>Create the AI agents</Button>
    </div>
  );
}

export default function SettingsPage() {
  const { data: s, mutate } = useApi<AppSettings>('/api/app-settings');
  const [group, setGroup] = useState('brand');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fields = useMemo(() => (s?.fields || []).filter(f => f.group === group), [s, group]);
  useEffect(() => setValues({}), [group]);

  const dirty = Object.keys(values).length > 0;
  const save = async () => {
    setBusy(true);
    try { const r = await put<{ changed: string[] }>('/api/app-settings', { values }); toast.success(`${r.changed.length} setting${r.changed.length === 1 ? '' : 's'} saved`); setValues({}); mutate(); } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };
  const testMail = async () => { try { const r = await post<{ ok: boolean; message: string }>('/api/app-settings/test', { what: 'email' }); r.ok ? toast.success(r.message) : toast.error(r.message); } catch (e: any) { toast.error(e.message); } };

  const groups = [...(s?.groups || []), { id: 'rubric', title: 'Scoring rubric', help: '' }];
  const icon = (id: string) => id === 'security' ? Lock : id === 'safety' ? ShieldAlert : id === 'rubric' ? Ruler : KeyRound;
  const current = groups.find(g => g.id === group);

  return (
    <>
      <PageHeader title="Settings" description="Keys are encrypted in the database and never shown again, only their last characters." />
      {s && !s.can_manage && <div className="mb-4 flex gap-2 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-[13px] text-warning"><Lock className="mt-0.5 size-4 shrink-0" />Read only. Set a dashboard password from the computer running the app before editing settings over the internet.</div>}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {groups.map(g => { const Icon = icon(g.id); return (
            <button key={g.id} onClick={() => setGroup(g.id)} className={cn('flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]', group === g.id ? 'bg-surface font-medium shadow-card ring-1 ring-border' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
              <Icon className="size-3.5" />{g.title}
            </button>
          ); })}
        </nav>
        {!s ? <Skeleton className="h-96 rounded-xl" /> : group === 'rubric' ? <Rubric /> : (
          <Card>
            <CardHeader title={current?.title} description={current?.help} />
            <CardBody className="space-y-5">
              {group === 'voice' && <VoiceTools s={s} />}
              {group === 'safety' && <div className="flex flex-wrap gap-2"><Badge tone={s.calls_locked ? 'success' : 'warning'} dot>{s.calls_locked ? 'Calls locked to the allowlist' : 'Production calling on'}</Badge><Badge tone={s.mail_locked ? 'success' : 'warning'} dot>{s.mail_locked ? 'Email locked to the allowlist' : 'Production email on'}</Badge></div>}
              {fields.map(f => {
                const v = values[f.key] ?? (f.type === 'secret' ? '' : f.value ?? '');
                const set = (x: string) => setValues(o => ({ ...o, [f.key]: x }));
                const meta = <span className="ml-2 inline-flex items-center gap-1 text-[11.5px] font-normal text-subtle">{f.is_set ? <CheckCircle2 className="size-3 text-success" /> : <XCircle className="size-3" />}{f.source === 'settings' ? 'saved here' : f.source === 'environment' ? 'from .env' : 'not set'}</span>;
                if (f.type === 'toggle') return <Switch key={f.key} checked={v === '1'} onChange={b => set(b ? '1' : '0')} label={f.label} description={f.help} disabled={!s.can_manage} />;
                return (
                  <Field key={f.key} label={<>{f.label}{meta}</>} help={f.help}>
                    {id => f.type === 'textarea' ? <Textarea id={id} value={v} onChange={e => set(e.target.value)} placeholder={f.placeholder} disabled={!s.can_manage} />
                      : f.type === 'select' ? <Select id={id} value={v} onChange={e => set(e.target.value)} disabled={!s.can_manage}><option value="">Default</option>{f.options?.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                      : <Input id={id} type={f.type === 'secret' ? 'password' : f.type === 'number' ? 'number' : 'text'} value={v} onChange={e => set(e.target.value)} disabled={!s.can_manage} autoComplete="off"
                          placeholder={f.type === 'secret' && f.hint ? `Saved (${f.hint}). Type to replace.` : f.placeholder} />}
                  </Field>
                );
              })}
              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                {group === 'email' && <Button onClick={testMail} disabled={!s.mail_ready}>Test mailbox login</Button>}
                {dirty && <Button variant="ghost" onClick={() => setValues({})}>Discard</Button>}
                <Button variant="primary" onClick={save} loading={busy} disabled={!dirty || !s.can_manage}>Save changes</Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
