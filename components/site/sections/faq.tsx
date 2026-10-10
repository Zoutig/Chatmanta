import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import './faq.css';

/**
 * M3d FAQ (accordion + FAQPage-JSON-LD) — PLACEHOLDER. Sectie-agent vult deze component (zie docs/site/CONTRACT.md).
 * Houd vast: default-export, id={SECTION_IDS.faq}, root-klasse `s-faq`, h2-id `h-faq`.
 */
export default function Faq() {
  return (
    <Section id={SECTION_IDS.faq} variant="default" className="s-faq" labelledBy="h-faq">
      <SectionHead titleId="h-faq" title="Veelgestelde vragen" />
      <div className="sec-placeholder">Volgt — M3d FAQ (accordion + FAQPage-JSON-LD)</div>
    </Section>
  );
}
