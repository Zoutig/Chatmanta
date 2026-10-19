import { SECTION_IDS } from '@/lib/site/navigation';
import { Reveal } from '../ui/reveal';
import { Section, SectionHead } from '../ui/section';
import { HowScroller } from './how-it-works/how-scroller';
import { Snippet } from './how-it-works/snippet';
import './how-it-works.css';

/**
 * §5 Hoe het werkt — drie stappen met een scroll-gestuurde sticky stage (≥900px):
 * URL intypen → crawl-scrub (tegels, teller, kennisbank) → embed-fragment + minisite.
 * Onder 900px: alleen de stappentekst plus het échte codefragment bij stap 3. De kleine
 * mobiele animaties (nep-URL-veld met "Lezen"-knop, tegels) zijn weg in de ronde
 * "site rustiger" (okt 2026): ze leken invoer zonder functie te zijn en kostten scrollruimte.
 * Alle tekst staat server-side in de stappenkolom; de stage is decoratief.
 */
export default function HowItWorks() {
  return (
    <Section id={SECTION_IDS.how} variant="tint" className="s-how" labelledBy="h-how">
      <Reveal>
        <SectionHead titleId="h-how" title="Zo staat ChatManta op je site" />
      </Reveal>
      <HowScroller>
        <div className="steps-col">
          <div className="step" data-step="0">
            <span className="no label">Stap 1</span>
            <h3>Geef je webadres op.</h3>
            <p>Wij lezen je website en, als je wilt, je documenten zoals prijslijsten, voorwaarden en handleidingen.</p>
          </div>
          <div className="step" data-step="1">
            <span className="no label">Stap 2</span>
            <h3>ChatManta leert je bedrijf kennen.</h3>
            <p>Elke pagina wordt doorzocht en geordend. Jij test de antwoorden voordat iemand anders ze ziet.</p>
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
        </div>
      </HowScroller>
    </Section>
  );
}
