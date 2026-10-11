// Globale 404 voor URL's die bij geen enkele root layout horen (de app heeft
// meerdere roots, zie app/_shell/app-root.tsx). Rendert een eigen document in
// site-stijl. Let op: proxy.ts stuurt onbekende paden voor niet-ingelogde
// bezoekers al eerder door, dus deze pagina is vooral een vangnet.
import type { Metadata } from 'next';
import { Footer } from '@/components/site/footer';
import { Nav } from '@/components/site/nav';
import { StatusPage } from '@/components/site/status-page';
import { LinkButton } from '@/components/site/ui/button';
import { ROUTES } from '@/lib/site/navigation';
import { siteFontClasses } from './(site)/fonts';
import './(site)/site.css';

export const metadata: Metadata = {
  title: 'Pagina niet gevonden · ChatManta',
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="nl">
      <body>
        <div className={`site-ui ${siteFontClasses}`}>
          <Nav />
          <main id="hoofd">
            <StatusPage
              label="404"
              title="Deze pagina bestaat niet"
              actions={
                <>
                  <LinkButton href={ROUTES.home}>Naar de startpagina</LinkButton>
                  <LinkButton href={ROUTES.demo} variant="link" arrow>
                    Bekijk live demo
                  </LinkButton>
                </>
              }
            >
              De link is misschien verlopen of er staat een typfout in.
            </StatusPage>
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
