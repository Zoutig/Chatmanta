import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import { Reveal } from '../ui/reveal';
import { RoiCalc } from './roi-calculator/roi-calc';
import './roi-calculator.css';

/**
 * Rekenhulp (ROI) — mockup-final §9. Schuifjes (client) + uitkomst met verende cijfers.
 * De startuitkomst (±6 uur · ±€170 · ±€140 · Start (€29 p/m)) staat al in de SSR-HTML.
 */
export default function RoiCalculator() {
  return (
    <Section id={SECTION_IDS.roi} variant="default" className="s-roi" labelledBy="h-roi" style={{ paddingTop: 0 }}>
      <Reveal>
        <SectionHead titleId="h-roi" title="Wat levert het je op?" />
      </Reveal>
      <RoiCalc />
    </Section>
  );
}
