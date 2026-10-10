import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import './pricing.css';

/**
 * M3c Prijzen (leest lib/site/pricing.ts) — PLACEHOLDER. Sectie-agent vult deze component (zie docs/site/CONTRACT.md).
 * Houd vast: default-export, id={SECTION_IDS.pricing}, root-klasse `s-pricing`, h2-id `h-price`.
 */
export default function Pricing() {
  return (
    <Section id={SECTION_IDS.pricing} variant="default" className="s-pricing" labelledBy="h-price">
      <SectionHead titleId="h-price" title="Eerlijke prijzen. Geen verrassingen." />
      <div className="sec-placeholder">Volgt — M3c Prijzen (leest lib/site/pricing.ts)</div>
    </Section>
  );
}
