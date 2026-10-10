import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import './dashboard-showcase.css';

/**
 * M3c Dashboard-showcase — PLACEHOLDER. Sectie-agent vult deze component (zie docs/site/CONTRACT.md).
 * Houd vast: default-export, id={SECTION_IDS.dashboard}, root-klasse `s-dashboard`, h2-id `h-dash`.
 */
export default function DashboardShowcase() {
  return (
    <Section id={SECTION_IDS.dashboard} variant="default" className="s-dashboard" labelledBy="h-dash">
      <SectionHead eyebrow="Jouw dashboard" titleId="h-dash" title="Jij ziet alles wat er gebeurt." lede="Elk gesprek, elke vraag die hij niet wist, elk contactverzoek: overzichtelijk in je eigen dashboard. Elke maand een rapport in je mailbox (Groei en Compleet)." />
      <div className="sec-placeholder">Volgt — M3c Dashboard-showcase</div>
    </Section>
  );
}
