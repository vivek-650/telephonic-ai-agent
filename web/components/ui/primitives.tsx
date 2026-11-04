// Small presentational building blocks shared by every page.
import { cn, type Tone } from '@/lib/utils';

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-card', className)} {...p} />;
}
export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h3 className="text-[13.5px] font-semibold tracking-tight">{title}</h3>
        {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
export const CardBody = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('px-5 pb-5', className)} {...p} />;

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted ring-border',
  accent: 'bg-accent-soft text-accent ring-accent/20',
  success: 'bg-success-soft text-success ring-success/20',
  warning: 'bg-warning-soft text-warning ring-warning/20',
  danger: 'bg-danger-soft text-danger ring-danger/20',
};
export function Badge({ tone = 'neutral', dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  // Stable hue per name, muted so it never competes with status colours.
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const letters = name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';
  return (
    <span className={cn('inline-grid shrink-0 place-items-center rounded-full font-medium text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `oklch(0.62 0.08 ${h})` }} aria-hidden>
      {letters}
    </span>
  );
}

/** Circular score out of 100, coloured by band. */
export function ScoreRing({ value, size = 44, stroke = 4 }: { value: number | null | undefined; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = value ?? 0;
  const color = value == null ? 'var(--border-strong)' : v >= 75 ? 'var(--success)' : v >= 55 ? 'var(--warning)' : 'var(--danger)';
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={value == null ? 'Not scored' : `Score ${v} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute font-mono font-semibold tabular-nums" style={{ fontSize: size * 0.3 }}>{value ?? '–'}</span>
    </span>
  );
}

export function Meter({ value, max = 100, tone = 'accent', className }: { value: number; max?: number; tone?: Tone; className?: string }) {
  const bg = { accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-subtle' }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', bg)} style={{ width: `${Math.max(0, Math.min(100, (value / (max || 1)) * 100))}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} />;
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon && <div className="mb-3 grid size-10 place-items-center rounded-full bg-surface-2 text-subtle"><Icon className="size-5" /></div>}
      <p className="text-[13.5px] font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[12.5px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: Tone }) {
  const iconTone = tone ? tones[tone] : 'bg-surface-2 text-muted ring-border';
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-muted">{label}</span>
        {Icon && <span className={cn('grid size-7 place-items-center rounded-md ring-1 ring-inset', iconTone)}><Icon className="size-3.5" /></span>}
      </div>
      <div className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[12px] text-subtle">{hint}</div>}
    </Card>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: React.ReactNode; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('flex items-center gap-1 border-b border-border', className)}>
      {items.map(it => (
        <button key={it.id} role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)}
          className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1 text-[13px] font-medium transition-colors',
            value === it.id ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg')}>
          {it.label}
          {it.count != null && <span className="rounded bg-surface-2 px-1 font-mono text-[11px] text-muted tabular-nums">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1 font-mono text-[11px] text-muted">{children}</kbd>;
}

export function DefinitionList({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]">
      {items.map(([k, v], i) => (<div key={i} className="contents"><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>))}
    </dl>
  );
}
