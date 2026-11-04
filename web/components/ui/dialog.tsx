'use client';
// Modal and side sheet on the native <dialog> element: focus trap, Escape and backdrop for free.
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);
  const onBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => { if (e.target === ref.current) onClose(); };
  return { ref, onBackdrop };
}

export function Dialog({ open, onClose, title, description, children, footer, className }: { open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  const { ref, onBackdrop } = useDialog(open, onClose);
  return (
    <dialog ref={ref} onClick={onBackdrop} className={cn('m-auto w-[min(560px,calc(100vw-32px))] rounded-2xl border border-border bg-surface p-0 text-fg shadow-pop', className)}>
      {open && (
        <div className="animate-fade-in">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close"><X className="size-4" /></button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Sheet({ open, onClose, children, width = 720 }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  const { ref, onBackdrop } = useDialog(open, onClose);
  return (
    <dialog ref={ref} onClick={onBackdrop} style={{ width: `min(${width}px, 100vw)` }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh border-l border-border bg-bg p-0 text-fg shadow-pop">
      {open && <div className="animate-fade-in h-full overflow-y-auto">{children}</div>}
    </dialog>
  );
}
