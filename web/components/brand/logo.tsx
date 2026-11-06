import { cn } from '@/lib/utils';
import { PRODUCT } from '@/lib/brand';

/** The product mark: a voice waveform in a rounded tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg bg-fg text-bg', className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
        <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
      </svg>
    </span>
  );
}

export function Logo({ className, label = PRODUCT }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-[14.5px] font-semibold tracking-tight">{label}</span>
    </span>
  );
}
