import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import './features.css';

/**
 * M3b Functies (bento) — PLACEHOLDER. Sectie-agent vult deze component (zie docs/site/CONTRACT.md).
 * Houd vast: default-export, id={SECTION_IDS.features}, root-klasse `s-features`, h2-id `h-feat`.
 */
export default function Features() {
  return (
    <Section id={SECTION_IDS.features} variant="default" className="s-features" labelledBy="h-feat">
      <SectionHead eyebrow="Functies" titleId="h-feat" title="Alles wat je nodig hebt. Niets wat je niet gebruikt." />
      <div className="sec-placeholder">Volgt — M3b Functies (bento)</div>
    </Section>
  );
}
