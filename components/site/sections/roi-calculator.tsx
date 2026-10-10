import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import './roi-calculator.css';

/**
 * M3c Rekenhulp (ROI) — PLACEHOLDER. Sectie-agent vult deze component (zie docs/site/CONTRACT.md).
 * Houd vast: default-export, id={SECTION_IDS.roi}, root-klasse `s-roi`, h2-id `h-roi`.
 */
export default function RoiCalculator() {
  return (
    <Section id={SECTION_IDS.roi} variant="default" className="s-roi" labelledBy="h-roi">
      <SectionHead titleId="h-roi" title="Wat levert het je op?" />
      <div className="sec-placeholder">Volgt — M3c Rekenhulp (ROI)</div>
    </Section>
  );
}
