import { SECTION_IDS } from '@/lib/site/navigation';
import { Reveal } from '../ui/reveal';
import { Section, SectionHead } from '../ui/section';
import { Inbox } from './problem/inbox';
import './problem.css';

const CARDS = [
  {
    n: '01',
    q: '"Waar staat jullie retourbeleid?"',
    title: 'Ze zoeken en vinden het niet.',
    body: "Het antwoord staat ergens op je site, maar bezoekers klikken niet door vijf pagina's. Ze haken af of gaan naar de concurrent.",
  },
  {
    n: '02',
    q: '"Wat kost een APK?"',
    title: 'Je mailbox loopt vol met hetzelfde.',
    body: '"Wat kost een APK?" "Leveren jullie in Groningen?" Elke dag dezelfde vragen, elke keer opnieuw typen.',
  },
  {
    n: '03',
    q: '"Kunnen jullie een offerte sturen?" · 22:00',
    title: 'De aanvraag van 22:00 is morgen koud.',
    body: "Wie 's avonds een offerte wil, wacht niet tot jij om 9 uur je mail opent.",
  },
] as const;

/**
 * M3a Probleem (mockup-final §4): drie herkenbare kaarten + inbox-illustratie met
 * teller (client-blad `problem/inbox.tsx`). Kaarten en kop faden in via <Reveal>.
 */
export default function Problem() {
  return (
    <Section
      id={SECTION_IDS.problem}
      variant="default"
      className="s-problem"
      labelledBy="h-prob"
      containerClassName="prob-grid"
    >
      <div>
        <Reveal>
          <SectionHead
            eyebrow="Herkenbaar"
            titleId="h-prob"
            title="Je klanten hebben vragen. Op momenten dat jij er niet bent."
          />
        </Reveal>
        <div className="prob-cards">
          {CARDS.map((c, i) => (
            <Reveal key={c.n} delay={i * 0.06}>
              <article className="pcard">
                <span className="q">{c.q}</span>
                <span className="n tnum">{c.n}</span>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
      <Inbox />
    </Section>
  );
}
