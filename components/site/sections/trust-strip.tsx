import { SECTION_IDS } from '@/lib/site/navigation';
import { Icon } from '../ui/icon';
import { Section } from '../ui/section';
import './trust-strip.css';

/**
 * M3a Vertrouwensstrook — PLACEHOLDER (teksten definitief, besluit 2026-10-10; layout
 * volgt). Houd vast: default-export, id={SECTION_IDS.trust}, root-klasse `s-trust`.
 */
export default function TrustStrip() {
  return (
    <Section
      id={SECTION_IDS.trust}
      variant="plain"
      className="s-trust"
      ariaLabel="Waarom je ChatManta kunt vertrouwen"
    >
      <ul>
        <li><Icon name="globe" />Opgeslagen in Europa</li>
        <li><Icon name="docCheck" />Verwerkersovereenkomst beschikbaar</li>
        <li><Icon name="chat" />Volledig Nederlands</li>
        <li><Icon name="shieldCheck" />Antwoordt alleen uit jouw content</li>
      </ul>
    </Section>
  );
}
