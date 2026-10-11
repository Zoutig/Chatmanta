import { ROUTES, SECTION_IDS } from '@/lib/site/navigation';
import { LinkButton } from '../ui/button';
import { Reveal } from '../ui/reveal';
import { Section, SectionHead } from '../ui/section';
import { HowScroller } from './how-it-works/how-scroller';
import { Snippet } from './how-it-works/snippet';
import './how-it-works.css';

/**
 * §5 Hoe het werkt — drie stappen met een scroll-gestuurde sticky stage (≥900px):
 * URL intypen → crawl-scrub (tegels, teller, kennisbank) → embed-fragment + minisite.
 * Onder 900px: geen stage, wel een kleine statische visual per stap (.mini).
 * Alle tekst staat server-side in de stappenkolom; de stage is decoratief.
 */
export default function HowItWorks() {
  return (
    <Section id={SECTION_IDS.how} variant="tint" className="s-how" labelledBy="h-how">
      <Reveal>
        <SectionHead eyebrow="Hoe het werkt" titleId="h-how" title="Zo staat ChatManta op je site." />
      </Reveal>
      <HowScroller>
        <div className="steps-col">
          <div className="step" data-step="0">
            <span className="no label">Stap 1</span>
            <h3>Geef je webadres op.</h3>
            <p>Wij lezen je website en, als je wilt, je documenten zoals prijslijsten, voorwaarden en handleidingen.</p>
            <div className="mini" aria-hidden="true">
              <div className="urlbox">
                <span className="val">vandam-fietsen.nl</span>
                <span className="go">Lezen</span>
              </div>
            </div>
          </div>
          <div className="step" data-step="1">
            <span className="no label">Stap 2</span>
            <h3>ChatManta leert je bedrijf kennen.</h3>
            <p>Elke pagina wordt doorzocht en geordend. Jij test de antwoorden voordat iemand anders ze ziet.</p>
            <div className="mini" aria-hidden="true">
              <div className="tiles">
                {Array.from({ length: 24 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
              <small>24 pagina&apos;s gelezen en geordend</small>
            </div>
          </div>
          <div className="step" data-step="2">
            <span className="no label">Stap 3</span>
            <h3>Eén regel code, en je bent live.</h3>
            <p>
              Plak het fragment in je site (WordPress, Shopify, Wix, alles werkt) of laat het ons doen. De chatbot
              verschijnt in jouw kleuren, met jouw logo.
            </p>
            <Snippet />
          </div>
          <div className="how-after">
            <LinkButton href={ROUTES.demo} variant="link" arrow>
              Zie het zelf: live demo
            </LinkButton>
          </div>
        </div>
      </HowScroller>
    </Section>
  );
}
