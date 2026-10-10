import type { Metadata } from 'next';
import { Azeret_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { Footer } from '@/components/site/footer';
import { Nav } from '@/components/site/nav';
import { SITE_URL } from '@/lib/site/navigation';
import './site.css';

// Marketingsite-layout (route group, dus geen URL-segment). Hangt onder de root-
// layout (app/layout.tsx: <html>/<body>, globals.css) maar zet een eigen ontwerplaag
// `.site-ui` neer; V0/V1/voorbeeld hebben hun eigen layouts en worden niet geraakt.

// Plus Jakarta Sans als variable font (één bestand, dekt 400-800). Enige UI-font.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-site',
  display: 'swap',
});
// Azeret Mono ALLEEN voor het codefragment (gewone 0, geen punt/streep). Niet preloaden:
// staat ver onder de vouw.
const azeret = Azeret_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-site-mono',
  display: 'swap',
  preload: false,
});

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

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site-ui ${jakarta.variable} ${azeret.variable}`}>
      <a className="sr-only skip-link" href="#hoofd">
        Naar de inhoud
      </a>
      <Nav />
      <main id="hoofd">{children}</main>
      <Footer />
    </div>
  );
}
