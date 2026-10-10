import type { Metadata } from 'next';
import { LinkButton } from '@/components/site/ui/button';
import { Container } from '@/components/site/ui/section';
import { ROUTES } from '@/lib/site/navigation';
import { SITE_COMPANY } from '@/lib/site/pricing';

// Placeholder tot de algemene voorwaarden er zijn (spec §5: "placeholder mag").
export const metadata: Metadata = {
  title: 'Algemene voorwaarden',
  description: 'De algemene voorwaarden van ChatManta volgen binnenkort.',
  alternates: { canonical: '/voorwaarden' },
};

export default function VoorwaardenPage() {
  return (
    <section className="page-simple" aria-labelledby="h-voorwaarden">
      <Container>
        <div className="card">
          <span className="eyebrow">Juridisch</span>
          <h1 id="h-voorwaarden" style={{ marginTop: 12 }}>
            Algemene voorwaarden
          </h1>
          <p>
            Onze algemene voorwaarden volgen binnenkort. Heb je ze nu al nodig, of heb je een vraag? Mail ons via{' '}
            <a href={`mailto:${SITE_COMPANY.email}`}>{SITE_COMPANY.email}</a>, dan sturen we je de actuele versie.
          </p>
          <p>
            Hoe we met persoonsgegevens omgaan, lees je in onze <a href={ROUTES.privacy}>privacyverklaring</a>.
          </p>
          <div style={{ marginTop: 28 }}>
            <LinkButton href={ROUTES.home} variant="outline" size="sm">
              Terug naar de startpagina
            </LinkButton>
          </div>
        </div>
      </Container>
    </section>
  );
}
