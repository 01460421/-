import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import 'katex/dist/katex.min.css';
import './globals.css';
import { t } from '@/lib/i18n';
import Disclaimer from '@/components/Disclaimer';
import ThemeToggle from '@/components/ThemeToggle';
import HeaderSearch from '@/components/HeaderSearch';

export const metadata: Metadata = {
  title: { default: t.appName, template: `%s · ${t.appName}` },
  description: t.appTagline,
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// 在 hydrate 前套用深色模式，避免閃爍
const themeScript = `try{var t=localStorage.getItem('sfl-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg) 85%, transparent)' }}>
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2">
            <Link href="/" className="font-semibold tracking-tight">
              📐 {t.appName}
            </Link>
            <HeaderSearch />
            <nav className="flex flex-wrap items-center gap-3 text-sm">
              <Link href="/dashboard" className="hover:underline">{t.nav.dashboard}</Link>
              <Link href="/accuracy" className="hover:underline">{t.nav.accuracy}</Link>
              <Link href="/events" className="hover:underline">{t.nav.events}</Link>
              <Link href="/health" className="hover:underline">{t.nav.health}</Link>
              <Link href="/privacy" className="hover:underline">{t.nav.privacy}</Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-4">{children}</main>
        <footer className="mt-8 border-t px-4 py-6 text-xs muted" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto max-w-[1600px] space-y-1">
            <p>{t.disclaimer}</p>
            <p>本站不使用「保證」「必漲」「穩賺」等字眼；所有指標皆可在介面上驗證其公式與資料來源。</p>
          </div>
        </footer>
        <Disclaimer />
      </body>
    </html>
  );
}
