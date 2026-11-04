import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Recruit OS', template: '%s · Recruit OS' },
  description: 'AI voice interviews, explainable scoring and a recruiter pipeline in one place.',
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fbfbfa' }, { media: '(prefers-color-scheme: dark)', color: '#0c0a09' }],
};

// Applies the saved or system theme before first paint, so there is no flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans text-[14px] leading-relaxed">
        {children}
        <Toaster position="bottom-right" toastOptions={{ className: 'font-sans' }} />
      </body>
    </html>
  );
}
