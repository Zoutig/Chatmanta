import Image from 'next/image';
import { SECTION_IDS } from '@/lib/site/navigation';
import { Section, SectionHead } from '../ui/section';
import { Reveal } from '../ui/reveal';
import { DashboardFrame } from './dashboard-showcase/dashboard-frame';
import './dashboard-showcase.css';

/**
 * Dashboard-showcase — mockup-final §8, met een ECHTE screenshot van het V1-klantdashboard
 * (overzicht) uit de publieke demo /voorbeeld: fictief vakantiepark, geen klantdata.
 * Screenshot: public/site/dashboard-overzicht.png (2880×1264, 2× van 1440 breed).
 */
export default function DashboardShowcase() {
  return (
    <Section id={SECTION_IDS.dashboard} variant="default" className="s-dashboard" labelledBy="h-dash">
      <Reveal>
        <SectionHead
          eyebrow="Jouw dashboard"
          titleId="h-dash"
          title="Jij ziet alles wat er gebeurt."
          lede="Elk gesprek, elke vraag die hij niet wist, elk contactverzoek: overzichtelijk in je eigen dashboard. Elke maand een rapport in je mailbox (Groei en Compleet)."
        />
      </Reveal>
      <DashboardFrame label="Weergave van het ChatManta-dashboard met gesprekken, kennisgaten en contactverzoeken (demo-omgeving)">
        <div className="dash-top" aria-hidden="true">
          <i />
          <i />
          <i />
          <span className="dash-url">chatmanta.nl/v1/dashboard</span>
          <small className="dash-env">demo-omgeving</small>
        </div>
        <div className="dash-shot">
          <Image
            src="/site/dashboard-overzicht.png"
            width={2880}
            height={1264}
            alt="Overzicht van het ChatManta-dashboard in de demo-omgeving: 418 gesprekken deze maand, 87% zelf beantwoord, 2 contactverzoeken, 43 kennisbronnen, vragen die de chatbot niet wist en de meest gestelde vragen."
            sizes="(min-width: 1240px) 1152px, 94vw"
          />
          <span className="lead-badge" aria-hidden="true">
            <i />
            Nieuw contactverzoek
          </span>
        </div>
      </DashboardFrame>
    </Section>
  );
}
