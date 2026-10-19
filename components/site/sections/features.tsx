import Image from 'next/image';
import { LEGACY_SECTION_IDS, SECTION_IDS } from '@/lib/site/navigation';
import { Reveal } from '../ui/reveal';
import { Section, SectionHead } from '../ui/section';
import './features.css';

/**
 * Functies — vier kernfuncties als rustige typografische lijst (geen kaarten, geen
 * doorlopende micro-animaties). Ronde "site rustiger" okt 2026: voorheen een bento met
 * zes geanimeerde tegels + een losse dashboard-showcase-sectie.
 * - Uit de lijst gehaald: "Antwoord mét bron" (V1 toont geen bronlinks, hard rule 9) en
 *   "Fast mode" (jargon; staat nog wel in de vergelijkingstabel bij de prijzen).
 * - De dashboard-screenshot staat hier, alleen vanaf 900px: op een telefoon is hij onleesbaar.
 *   `loading="lazy"` + `display:none` ⇒ mobiel downloadt hem niet.
 * Teksten volgen wat het product nu doet: contact via de (opt-in) knop in de chat, de
 * kennisgat-quiz en het maandrapport worden door ons begeleid.
 */
const ITEMS: ReadonlyArray<{ id: string; title: string; body: string; plan?: string }> = [
  {
    id: 'lead',
    title: 'Contactverzoeken',
    body: 'Wil een bezoeker liever persoonlijk contact? Via een kort formulier in de chat laat hij naam en e-mail of telefoonnummer achter, en jij krijgt een seintje.',
    plan: 'Groei en Compleet',
  },
  {
    id: 'read',
    title: 'Gesprekken teruglezen',
    body: 'Zie wat bezoekers vragen, wat de chatbot antwoordde en welke vragen hij niet kon beantwoorden. In Groei en Compleet zetten wij elke maand de belangrijkste inzichten voor je op een rij.',
  },
  {
    id: 'quiz',
    title: 'Kennisgat-quiz',
    body: 'Wij zoeken met je mee waar je kennisbank nog gaten heeft en zetten daar een paar korte vragen voor je klaar. Jouw antwoorden vullen het gat, voortaan voor iedereen.',
    plan: 'Groei en Compleet',
  },
  {
    id: 'style',
    title: 'Jouw stijl, jouw logo',
    body: 'Eigen kleur, eigen icoon, eigen begroeting. De chat voelt als onderdeel van je site.',
  },
];

export default function Features() {
  return (
    <Section id={SECTION_IDS.features} variant="default" className="s-features" labelledBy="h-feat">
      {/* Alias voor oude links naar de vervallen dashboard-sectie (screenshot staat nu hier). */}
      <span id={LEGACY_SECTION_IDS.dashboard} aria-hidden="true" />
      <Reveal>
        <SectionHead titleId="h-feat" title="Wat je erbij krijgt" />
      </Reveal>
      <ul className="feat-list">
        {ITEMS.map((f) => (
          <li key={f.id}>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
            {f.plan ? <p className="plan-note">In {f.plan}</p> : null}
          </li>
        ))}
      </ul>
      <figure className="feat-shot">
        <Image
          src="/site/dashboard-overzicht.png"
          width={2880}
          height={1264}
          alt="Overzicht van het ChatManta-dashboard in de demo-omgeving: 418 gesprekken deze maand, 87% zelf beantwoord, 2 contactverzoeken, 43 kennisbronnen, vragen die de chatbot niet wist en de meest gestelde vragen."
          sizes="(min-width: 1240px) 1152px, 94vw"
          loading="lazy"
        />
        <figcaption>Je eigen dashboard, hier met de gegevens van ons fictieve voorbeeldbedrijf.</figcaption>
      </figure>
    </Section>
  );
}
