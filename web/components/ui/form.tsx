import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

const control = 'w-full rounded-lg border border-border bg-surface px-3 text-[13.5px] text-fg shadow-card placeholder:text-subtle transition-[border,box-shadow] focus:border-accent focus:outline-none focus:ring-3 focus:ring-[var(--ring)] disabled:opacity-60 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(control, 'h-9', className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-20 py-2 leading-relaxed', className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn(control, 'h-9 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2378716c%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E")] bg-[position:right_10px_center] bg-no-repeat pr-8', className)} {...p}>
      {children}
    </select>
  );
});

/** Label + control + help/error, wired together for screen readers. */
export function Field({ label, help, error, required, className, children }: { label: React.ReactNode; help?: React.ReactNode; error?: string | null; required?: boolean; className?: string; children: (id: string, describedBy?: string) => React.ReactNode }) {
  const id = useId(), hid = `${id}-help`;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-[12.5px] font-medium text-fg">{label}{required && <span className="ml-0.5 text-danger">*</span>}</label>
      {children(id, help || error ? hid : undefined)}
      {(error || help) && <p id={hid} className={cn('text-[12px]', error ? 'text-danger' : 'text-muted')}>{error || help}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4', disabled && 'cursor-not-allowed opacity-60')}>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-[12px] text-muted">{description}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border-strong')}>
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
    </label>
  );
}

export function Checkbox({ checked, onChange, children, className }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-[13px]', className)}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
      <span>{children}</span>
    </label>
  );
}
