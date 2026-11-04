import { PublicHeader } from '@/components/public/header';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border py-6 text-center text-[12px] text-subtle">
        Interviews are run by an AI recruiter and reviewed by people. Your data is used only for hiring decisions.
      </footer>
    </div>
  );
}
