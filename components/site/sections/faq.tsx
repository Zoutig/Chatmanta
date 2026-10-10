import { SECTION_IDS } from '@/lib/site/navigation';
import { Reveal } from '../ui/reveal';
import { Section, SectionHead } from '../ui/section';
import { FaqAccordion } from './faq/faq-accordion';
import { FAQ_ITEMS, faqJsonLd } from './faq/faq-data';
import './faq.css';

/**
 * §12 FAQ: toegankelijke accordion (client-blad) + FAQPage-JSON-LD (server-gerenderd,
 * zelfde bron als de zichtbare vragen). Mockup: padding-top 0, kop gecentreerd.
 */
export default function Faq() {
  return (
    <Section id={SECTION_IDS.faq} variant="default" className="s-faq" labelledBy="h-faq">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()).replace(/</g, '\\u003c') }}
      />
      <Reveal>
        <SectionHead titleId="h-faq" title="Veelgestelde vragen" center />
      </Reveal>
      <FaqAccordion items={FAQ_ITEMS} />
    </Section>
  );
}
