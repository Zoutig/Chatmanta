import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import './problem.css';

/**
 * M3a Probleem (kaarten + inbox-teller) — PLACEHOLDER. Sectie-agent vult deze component (zie docs/site/CONTRACT.md).
 * Houd vast: default-export, id={SECTION_IDS.problem}, root-klasse `s-problem`, h2-id `h-prob`.
 */
export default function Problem() {
  return (
    <Section id={SECTION_IDS.problem} variant="default" className="s-problem" labelledBy="h-prob">
      <SectionHead eyebrow="Herkenbaar" titleId="h-prob" title="Je klanten hebben vragen. Op momenten dat jij er niet bent." />
      <div className="sec-placeholder">Volgt — M3a Probleem (kaarten + inbox-teller)</div>
    </Section>
  );
}
