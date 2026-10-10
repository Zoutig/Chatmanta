import { SITE_COMPANY } from '@/lib/site/pricing';
import { ROUTES, SECTION_IDS } from '@/lib/site/navigation';
import { LinkButton } from '../ui/button';
import { Section } from '../ui/section';
import './final-cta.css';

/**
 * M3d Slot-CTA — PLACEHOLDER met definitieve teksten. Sectie-agent voegt de navy kaart,
 * golflijn en vliegende manta toe. Houd vast: default-export, id={SECTION_IDS.finalCta},
 * root-klasse `s-final`, h2-id `h-final`.
 */
export default function FinalCta() {
  return (
    <Section id={SECTION_IDS.finalCta} variant="default" className="s-final" labelledBy="h-final">
      <h2 id="h-final">Laat je website vanavond al meedenken.</h2>
      <p className="lede">
        In een kennismaking van 20 minuten kijken we samen naar je site en wat ChatManta voor je kan doen. Geen
        verplichtingen.
      </p>
      <div className="s-final-ctas">
        <LinkButton href={ROUTES.kennismaking} arrow>
          Plan een kennismaking
        </LinkButton>
        <LinkButton href={ROUTES.demo} variant="link" arrow>
          Bekijk live demo
        </LinkButton>
      </div>
      <p className="s-final-mail">
        Liever mailen? <a href={`mailto:${SITE_COMPANY.email}`}>{SITE_COMPANY.email}</a>
      </p>
    </Section>
  );
}
