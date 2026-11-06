import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { PRODUCT, PRODUCT_TAGLINE } from '@/lib/brand';

const COLUMNS = [
  { title: 'Product', links: [['How it works', '/#how'], ['Features', '/#features'], ['Scoring', '/#scoring'], ['Trust and fairness', '/#trust']] },
  { title: 'For recruiters', links: [['Open dashboard', '/dashboard'], ['Sign in', '/login'], ['FAQ', '/#faq']] },
  { title: 'For candidates', links: [['Open roles', '/careers'], ['What to expect', '/#how']] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-[13px] leading-relaxed text-muted">{PRODUCT_TAGLINE}</p>
        </div>
        {COLUMNS.map(c => (
          <div key={c.title}>
            <p className="text-[12.5px] font-semibold">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map(([label, href]) => <li key={label}><Link href={href} className="text-[13px] text-muted transition-colors hover:text-fg">{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-[12px] text-subtle">
          <p>© {new Date().getFullYear()} {PRODUCT}. Self-hosted; your candidate data stays on your server.</p>
          <p>AI interviews, human decisions.</p>
        </div>
      </div>
    </footer>
  );
}
