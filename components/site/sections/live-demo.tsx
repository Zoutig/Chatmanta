import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import './live-demo.css';

/**
 * M3d Live demo — PLACEHOLDER. Sectie-agent vult deze component (zie docs/site/CONTRACT.md).
 * Houd vast: default-export, id={SECTION_IDS.demo}, root-klasse `s-demo`, h2-id `h-demo`.
 */
export default function LiveDemo() {
  return (
    <Section id={SECTION_IDS.demo} variant="default" className="s-demo" labelledBy="h-demo">
      <SectionHead titleId="h-demo" title="Probeer hem zelf. Stel een moeilijke vraag." lede="Op onze voorbeeldsite draait een echte ChatManta. Vraag wat je wilt en kijk wat hij doet als hij het antwoord niet weet." />
      <div className="sec-placeholder">Volgt — M3d Live demo</div>
    </Section>
  );
}
