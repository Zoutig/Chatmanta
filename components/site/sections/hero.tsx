import { SECTION_IDS, ROUTES } from '@/lib/site/navigation';
import { LinkButton } from '../ui/button';
import { Icon } from '../ui/icon';
import { Section } from '../ui/section';
import { HeroChat } from './hero/hero-chat';
import './hero.css';

/**
 * M3a Hero (mockup-final §2). Server component: kop, sub, CTA's en risk reversal staan
 * statisch in de HTML (LCP-content, nooit achter animatie). Rechts het navy cut-out-paneel
 * dat tot de schermrand doorloopt, met daarop de zelftypende chat (client-blad
 * `hero/hero-chat.tsx`). Mobiel: copy + primaire CTA staan in DOM-volgorde vóór het gesprek.
 */
export default function Hero() {
  return (
    <Section
      id={SECTION_IDS.hero}
      variant="plain"
      className="s-hero"
      labelledBy="h-hero"
      containerClassName="hero-grid"
    >
      <div className="hero-copy">
        <h1 id="h-hero">
          Je website beantwoordt elke klantvraag. <span className="soft">Ook om 23:00.</span>
        </h1>
        <p className="lede">
          ChatManta leest je website en documenten en geeft bezoekers direct antwoord, met een link naar de bron.
          Weet hij het niet? Dan zegt hij dat eerlijk en vraagt hij om hun gegevens.
        </p>
        <div className="hero-ctas">
          <LinkButton href={ROUTES.kennismaking} arrow>
            Plan een gratis kennismaking
          </LinkButton>
          <LinkButton href={ROUTES.demo} variant="link" arrow>
            Bekijk live demo
          </LinkButton>
        </div>
        <ul className="rr" aria-label="Zonder risico">
          <li>
            <Icon name="check" />
            14 dagen gratis
          </li>
          <li>
            <Icon name="check" />
            Maandelijks opzegbaar
          </li>
          <li>
            <Icon name="check" />
            Inrichting gratis
          </li>
        </ul>
      </div>

      <div className="hero-stage">
        <div className="cutout" aria-hidden="true">
          <span className="cut-label label">Fictief bedrijf · ter illustratie</span>
        </div>
        <HeroChat />
      </div>
    </Section>
  );
}
