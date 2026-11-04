'use client';
// Chart wrappers on Recharts with the app's tokens, so every chart reads as one system in light and dark.
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const PALETTE = ['var(--accent)', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];
const axis = { stroke: 'var(--fg-subtle)', fontSize: 11, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label, unit = '' }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] shadow-pop">
      {label != null && <div className="mb-0.5 text-muted">{label}</div>}
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 font-medium tabular-nums">
          <span className="size-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          {p.name !== 'n' && p.name ? `${p.name}: ` : ''}{p.value}{unit}
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars with conversion from the first step, for hiring funnels. */
export function Funnel({ data }: { data: { label: string; n: number }[] }) {
  const top = Math.max(data[0]?.n || 0, 1);
  return (
    <ol className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d.label} className="grid grid-cols-[110px_1fr_64px] items-center gap-3 text-[12.5px]">
          <span className="truncate text-muted">{d.label}</span>
          <div className="h-6 overflow-hidden rounded-md bg-surface-2">
            <div className="h-full rounded-md transition-[width] duration-700" style={{ width: `${Math.max(2, (d.n / top) * 100)}%`, background: 'var(--accent)', opacity: 1 - i * 0.11 }} />
          </div>
          <span className="text-right font-mono tabular-nums">{d.n}<span className="ml-1 text-subtle">{i ? `${Math.round((d.n / top) * 100)}%` : ''}</span></span>
        </li>
      ))}
    </ol>
  );
}

export function Histogram({ data, height = 180, color = 'var(--accent)' }: { data: { label: string; n: number }[]; height?: number; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<TooltipBox />} />
        <Bar dataKey="n" name="Candidates" fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupedBars({ data, keys, height = 220 }: { data: Record<string, any>[]; keys: { key: string; label: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="name" {...axis} interval={0} tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + '…' : v)} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<TooltipBox />} />
        {keys.map((k, i) => <Bar key={k.key} dataKey={k.key} name={k.label} fill={PALETTE[i]} radius={[3, 3, 0, 0]} maxBarSize={18} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 180 }: { data: { label: string; n: number }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.n, 0);
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="n" nameKey="label" innerRadius="66%" outerRadius="100%" paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip content={<TooltipBox />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><div className="text-[20px] font-semibold tabular-nums">{total}</div><div className="text-[11px] text-muted">total</div></div>
        </div>
      </div>
      <ul className="min-w-0 space-y-1.5 text-[12.5px]">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="truncate text-muted">{d.label}</span>
            <span className="ml-auto pl-3 font-mono tabular-nums">{d.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
