import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import './honest.css';

/**
 * M3b Liever eerlijk dan verzonnen (nacht-sectie) — PLACEHOLDER. Sectie-agent vult deze component (zie docs/site/CONTRACT.md).
 * Houd vast: default-export, id={SECTION_IDS.honest}, root-klasse `s-honest`, h2-id `h-honest`.
 */
export default function Honest() {
  return (
    <Section id={SECTION_IDS.honest} variant="dark" className="s-honest" labelledBy="h-honest">
      <SectionHead eyebrow="Ons uitgangspunt" titleId="h-honest" title="Liever eerlijk dan verzonnen." />
      <div className="sec-placeholder">Volgt — M3b Liever eerlijk dan verzonnen (nacht-sectie)</div>
    </Section>
  );
}
