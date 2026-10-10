import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import './how-it-works.css';

/**
 * M3b Hoe het werkt (scroll-gestuurde stage) — PLACEHOLDER. Sectie-agent vult deze component (zie docs/site/CONTRACT.md).
 * Houd vast: default-export, id={SECTION_IDS.how}, root-klasse `s-how`, h2-id `h-how`.
 */
export default function HowItWorks() {
  return (
    <Section id={SECTION_IDS.how} variant="tint" className="s-how" labelledBy="h-how">
      <SectionHead eyebrow="Hoe het werkt" titleId="h-how" title="Zo staat ChatManta op je site." />
      <div className="sec-placeholder">Volgt — M3b Hoe het werkt (scroll-gestuurde stage)</div>
    </Section>
  );
}
