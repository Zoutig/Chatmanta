// V0 Klantendashboard — Contactverzoeken (lijst + werkstroom).
//
// Read uit v0_contact_requests voor de actieve org (cookie-resolutie, zoals de
// rest van het dashboard). Per verzoek: naam, voorkeur, contact, onderwerp,
// status-badge, datum, null-safe link naar het bron-gesprek + toelichting/notitie.
// Status/notitie/wissen lopen via de server-actions in actions.ts.
//
// De tab is alleen bereikbaar als de contactverzoeken-toggle aan staat — bij uit
// tonen we een uitleg-state i.p.v. de lijst (de NavItem is dan sowieso verborgen,
// maar een directe URL mag geen rauwe data tonen).

import { PhoneCall } from 'lucide-react';

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import {
  getContactRequestsSettings,
} from '@/lib/v0/klantendashboard/server/settings';
import { listContactRequests } from '@/lib/v0/klantendashboard/server/contact-requests-read';
import { PageHead } from '../components/ui/page-head';
import { ContactRequestCard } from './components/contact-request-card';

export const metadata = { title: 'Contactverzoeken · ChatManta' };
export const dynamic = 'force-dynamic';

export default async function ContactverzoekenPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const settings = await getContactRequestsSettings(activeOrg.slug);

  if (!settings.enabled) {
    return (
      <>
        <PageHead
          eyebrow="Contactverzoeken"
          title="Contactverzoeken staat uit"
          subtitle="Zet contactverzoeken aan bij Instellingen om bezoekers via de chatbot een terugbel- of mailverzoek te laten achterlaten."
        />
        <div className="klant-empty">
          <div className="klant-empty-icon">
            <PhoneCall size={26} strokeWidth={1.6} />
          </div>
          <h3 className="klant-empty-title">Nog niet ingeschakeld</h3>
          <p className="klant-empty-sub">
            Ga naar Instellingen en zet &ldquo;Contactverzoeken&rdquo; aan. Daarna kan je chatbot
            bezoekers met een contactvraag een kort formulier aanbieden.
          </p>
        </div>
      </>
    );
  }

  const items = await listContactRequests(activeOrg.slug);

  return (
    <>
      <PageHead
        eyebrow="Contactverzoeken"
        title="Bezoekers die contact willen"
        subtitle="Verzoeken die je chatbot heeft opgehaald. Werk ze weg via Nieuw → Opgepakt → Afgehandeld, voeg een notitie toe en verwijder ze wanneer je klaar bent."
      />

      {items.length === 0 ? (
        <div className="klant-empty">
          <div className="klant-empty-icon">
            <PhoneCall size={26} strokeWidth={1.6} />
          </div>
          <h3 className="klant-empty-title">Nog geen contactverzoeken</h3>
          <p className="klant-empty-sub">
            Zodra een bezoeker via de chatbot om contact vraagt, verschijnt het verzoek hier.
          </p>
        </div>
      ) : (
        <div className="contactverzoeken-list">
          {items.map((r) => (
            <ContactRequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </>
  );
}
