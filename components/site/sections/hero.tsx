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
          {/* Contourlijnen als inline SVG i.p.v. de --contours-achtergrond: een CSS-
              achtergrondafbeelding telt als LCP-kandidaat en dit paneel is mobiel groter
              dan de h1, waardoor LCP op een decoratie wachtte. Zelfde paden als --contours. */}
          <svg className="cut-lines" viewBox="0 0 800 520" preserveAspectRatio="xMidYMid slice" focusable="false">
            <g fill="none" stroke="#5eead4" strokeOpacity=".10" strokeWidth="1.1">
              <path d="M-20 40C140 0 260 90 420 52S660 -6 820 30" />
              <path d="M-20 100C150 64 270 150 430 112S670 50 820 92" />
              <path d="M-20 164C160 128 280 214 440 176S680 112 820 156" />
              <path d="M-20 230C170 196 290 280 450 242S690 176 820 222" />
              <path d="M-20 298C180 266 300 348 460 310S700 242 820 290" />
              <path d="M-20 368C190 338 310 418 470 380S710 310 820 360" />
              <path d="M-20 440C200 412 320 490 480 452S720 380 820 432" />
              <path d="M-20 512C210 486 330 562 490 524S730 452 820 504" />
            </g>
          </svg>
          <span className="cut-label label">Fictief bedrijf · ter illustratie</span>
        </div>
        <HeroChat />
      </div>
    </Section>
  );
}
