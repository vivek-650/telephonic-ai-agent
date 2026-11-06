import Link from 'next/link';
import { PublicHeader } from '@/components/public/header';
import { PRODUCT } from '@/lib/brand';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border py-6 text-center text-[12px] text-subtle">
        <p>Interviews are run by an AI recruiter and reviewed by people. Your data is used only for hiring decisions.</p>
        <p className="mt-1.5">Powered by <Link href="/" className="font-medium text-muted hover:text-fg">{PRODUCT}</Link></p>
      </footer>
    </div>
  );
}
