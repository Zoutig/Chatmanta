// Voorbeeldwebsite van het FICTIEVE Vakantiepark De Duinhoeve (/voorbeeld/website).
// Op deze site draait de ChatManta-demowidget; de kennisbank van de bot is de
// tekst van precies deze pagina's (lib/voorbeeld/site-content.ts).
import './site.css';
import type { Metadata } from 'next';
import { DEMO_SHARE_BASE, DEMO_SHARE_IMAGE } from '@/lib/voorbeeld/demo-defaults';
import Link from 'next/link';
import { Fraunces, Inter } from 'next/font/google';
import { ForceLight } from '@/app/v1/_ui/force-light';
import { DemoWidgetMount } from '@/app/voorbeeld/_widget/demo-widget-mount';
import { DEMO_CONTACT_HREF } from '@/lib/voorbeeld/demo-defaults';
import {
  COMPANY,
  MAIN_NAV,
  PAGE_GROUP_LABELS,
  RECEPTION_HOURS,
  SITE_PAGES,
  pathFor,
  type SitePageGroup,
} from '@/lib/voorbeeld/site-content';
import { SiteHeader } from './_components/site-header';
import { DuinhoeveMark } from './_components/logo';

const serif = Fraunces({
  subsets: ['latin'],
  variable: '--dh-font-serif',
  display: 'swap',
});
const sans = Inter({
  subsets: ['latin'],
  variable: '--dh-font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    template: '%s | Vakantiepark De Duinhoeve',
    default: 'Vakantiepark De Duinhoeve',
  },
  description: 'Fictieve voorbeeldwebsite van een vakantiepark in de Zeeuwse duinen, met de ChatManta-chatbot.',
  robots: { index: false, follow: false },
  metadataBase: DEMO_SHARE_BASE,
  openGraph: {
    type: 'website',
    locale: 'nl_NL',
    siteName: 'ChatManta',
    title: 'Voorbeeldwebsite met de ChatManta-chatbot',
    description: 'Stel een vraag aan de chatbot rechtsonder: hij antwoordt met de tekst van deze website.',
    images: [DEMO_SHARE_IMAGE],
  },
  twitter: { card: 'summary_large_image', images: [DEMO_SHARE_IMAGE.url] },
};

const FOOTER_GROUPS: SitePageGroup[] = ['verblijf', 'park', 'praktisch', 'over'];

export default function VoorbeeldWebsiteLayout({ children }: { children: React.ReactNode }) {
  const nav = MAIN_NAV.map((n) => ({ href: pathFor(n.slug), label: n.label }));

  return (
    <>
      <div className={`dh-site ${serif.variable} ${sans.variable}`}>
        <ForceLight />
        <a href="#dh-main" className="dh-skip">
          Naar de inhoud
        </a>

        <div className="dh-demobar" role="note">
          <div className="dh-container dh-demobar-inner">
            <p>Dit is een voorbeeldwebsite van een fictief bedrijf. De chatbot rechtsonder is ChatManta.</p>
            <span className="dh-demobar-links">
              <a href={DEMO_CONTACT_HREF} className="dh-demobar-link">
                Ook voor jouw website?
              </a>
              <Link href="/voorbeeld" className="dh-demobar-link">
                ← Terug naar het dashboard
              </Link>
            </span>
          </div>
        </div>

        <SiteHeader nav={nav} bookHref={pathFor('boeken-en-betalen')} homeHref={pathFor('')} />

        <main id="dh-main" className="dh-main">
          {children}
        </main>

        <footer className="dh-footer">
          <div className="dh-container">
            <div className="dh-footer-top">
              <div className="dh-footer-brand">
                <div className="dh-footer-logo">
                  <DuinhoeveMark size={44} />
                  <span>De Duinhoeve</span>
                </div>
                <address className="dh-footer-address">
                  {COMPANY.street}
                  <br />
                  {COMPANY.postcode} {COMPANY.city}
                  <br />
                  Telefoon {COMPANY.phone}
                  <br />
                  <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
                </address>
                <h2 className="dh-footer-heading">Receptie</h2>
                <ul className="dh-footer-hours">
                  {RECEPTION_HOURS.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>

              <nav className="dh-footer-sitemap" aria-label="Sitemap">
                {FOOTER_GROUPS.map((g) => (
                  <div key={g}>
                    <h2 className="dh-footer-heading">{PAGE_GROUP_LABELS[g]}</h2>
                    <ul>
                      {SITE_PAGES.filter((p) => p.group === g && p.slug !== '').map((p) => (
                        <li key={p.slug}>
                          <Link href={p.path}>{p.navLabel}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>

            <div className="dh-footer-bottom">
              <p>
                © {COMPANY.founded} tot nu, {COMPANY.name}. KvK {COMPANY.kvk}.
              </p>
              <p className="dh-footer-fiction">{COMPANY.fictionNotice}</p>
            </div>
          </div>
        </footer>
      </div>
      {/* Buiten .dh-site: de site-stijlen (h2, p, a) mogen de widget niet raken. */}
      <DemoWidgetMount />
    </>
  );
}
