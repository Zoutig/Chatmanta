import { SITE_COMPANY } from '@/lib/site/pricing';
import { ROUTES, SECTION_IDS } from '@/lib/site/navigation';
import { LinkButton } from '../ui/button';
import { Section } from '../ui/section';
import { FinalSea } from './final-cta/final-sea';
import './final-cta.css';

/**
 * §13 Slot-CTA: navy kaart met contourlijnen, een golflijn en het echte merkteken dat
 * er één keer langs zwemt (client-blad FinalSea). Tekst en knoppen zijn server-HTML.
 */
export default function FinalCta() {
  return (
    <Section id={SECTION_IDS.finalCta} variant="default" className="s-final" labelledBy="h-final">
      <div className="final-card">
        <div className="contour" aria-hidden="true" />
        <FinalSea />
        <div className="final-copy">
          <h2 id="h-final">Laat je website vanavond al meedenken.</h2>
          <p>
            In een kennismaking van 20 minuten kijken we samen naar je site en wat ChatManta voor je kan doen. Geen
            verplichtingen.
          </p>
          <div className="ctas">
            <LinkButton href={ROUTES.kennismaking} variant="teal" arrow>
              Plan een kennismaking
            </LinkButton>
            <LinkButton href={ROUTES.demo} variant="link" arrow>
              Bekijk live demo
            </LinkButton>
          </div>
          <p className="mail">
            Liever mailen? <a href={`mailto:${SITE_COMPANY.email}`}>{SITE_COMPANY.email}</a>
          </p>
        </div>
      </div>
    </Section>
  );
}
