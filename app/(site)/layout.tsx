import { Analytics } from '@vercel/analytics/next';
import type { Metadata, Viewport } from 'next';
import { Footer } from '@/components/site/footer';
import { Nav } from '@/components/site/nav';
import { SITE_URL } from '@/lib/site/navigation';
import { siteFontClasses } from './fonts';
import './site.css';

// Marketingsite-layout (route group, dus geen URL-segment). EIGEN root layout
// (<html>/<body>): de site laadt bewust NIET globals.css/manta.css en de
// Inter/JetBrains-fonts van de app-shell (app/_shell/app-root.tsx) — scheelt
// ~145 KB render-blocking CSS + font-preloads. De basis-reset die Tailwind's
// preflight voorheen leverde staat nu in site.css (@layer site-base).

const DESCRIPTION =
  'ChatManta: de Nederlandse website-chatbot die alleen antwoordt uit jouw eigen website en documenten, met bron erbij.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'ChatManta website-chatbot',
    template: '%s · ChatManta',
  },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    locale: 'nl_NL',
    siteName: 'ChatManta',
    title: 'ChatManta website-chatbot',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChatManta website-chatbot',
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <div className={`site-ui ${siteFontClasses}`}>
          <a className="sr-only skip-link" href="#hoofd">
            Naar de inhoud
          </a>
          <Nav />
          <main id="hoofd">{children}</main>
          <Footer />
        </div>
        {/* Cookieloze bezoekersstatistiek (Vercel Web Analytics): geen cookies, geen
            persoonsgegevens → geen cookiebanner nodig. Alleen op de publieke site. */}
        <Analytics />
      </body>
    </html>
  );
}
