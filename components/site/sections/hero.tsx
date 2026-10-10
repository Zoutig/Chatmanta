import { SECTION_IDS, ROUTES } from '@/lib/site/navigation';
import { LinkButton } from '../ui/button';
import { Icon } from '../ui/icon';
import { Section } from '../ui/section';
import './hero.css';

/**
 * M3a Hero — PLACEHOLDER met de definitieve teksten (SSR, LCP-content: niet verbergen
 * achter animaties). Sectie-agent voegt cut-out-paneel + zelftypende chat toe
 * (zie docs/site/CONTRACT.md). Houd vast: default-export, id={SECTION_IDS.hero} ("top"),
 * root-klasse `s-hero`, enige <h1> van de pagina met id `h-hero`.
 */
export default function Hero() {
  return (
    <Section id={SECTION_IDS.hero} variant="plain" className="s-hero" labelledBy="h-hero">
      <div className="s-hero-copy">
        <h1 id="h-hero">
          Je website beantwoordt elke klantvraag. <span className="soft">Ook om 23:00.</span>
        </h1>
        <p className="lede">
          ChatManta leest je website en documenten en geeft bezoekers direct antwoord, met een link naar de bron.
          Weet hij het niet? Dan zegt hij dat eerlijk en vraagt hij om hun gegevens.
        </p>
        <div className="s-hero-ctas">
          <LinkButton href={ROUTES.kennismaking} arrow>
            Plan een gratis kennismaking
          </LinkButton>
          <LinkButton href={ROUTES.demo} variant="link" arrow>
            Bekijk live demo
          </LinkButton>
        </div>
        <ul className="rr" aria-label="Zonder risico">
          <li><Icon name="check" />14 dagen gratis</li>
          <li><Icon name="check" />Maandelijks opzegbaar</li>
          <li><Icon name="check" />Inrichting gratis</li>
        </ul>
      </div>
    </Section>
  );
}
