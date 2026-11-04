import { forwardRef } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const base = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-[background,color,border,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 select-none';
const variants: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:bg-fg/85 shadow-card',
  secondary: 'bg-surface text-fg border border-border hover:bg-surface-2 shadow-card',
  outline: 'border border-border-strong text-fg hover:bg-surface-2',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:bg-danger/90 shadow-card',
};
const sizes: Record<Size, string> = { sm: 'h-7 px-2.5 text-[12.5px]', md: 'h-8.5 px-3 text-[13px]', lg: 'h-10 px-4 text-sm', icon: 'h-8 w-8' };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; loading?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...props }, ref) {
  return (
    <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = 'secondary', size = 'md', className, children, external, ...rest }: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode; external?: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const cls = cn(base, variants[variant], sizes[size], className);
  return external ? <a href={href} className={cls} target="_blank" rel="noreferrer" {...rest}>{children}</a> : <Link href={href} className={cls} {...rest}>{children}</Link>;
}
