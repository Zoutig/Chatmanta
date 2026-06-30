// V1 Klantendashboard — Contactverzoeken (inbox + werkstroom).
//
// Auth-keten = die van /v1/app (getSessionOrg). Org uit de sessie. De lijst leest
// onder de session-client (RLS, org-leden-SELECT) — ECHTE bezoekers-PII, dus
// nooit service-role hier. Status/notitie/wissen lopen via de gegate server-actions.
//
// De tab toont alléén data als de contactverzoeken-toggle aan staat; staat 'ie uit
// dan tonen we een uitleg-state (een directe URL mag geen rauwe data tonen).

import { PhoneCall } from 'lucide-react';

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { getOrgChatbot } from '../rag-config';
import { getChatbotSettings } from '../instellingen/settings-config';
import {
  listContactRequests,
  STATUS_FLOW,
  STATUS_LABEL,
  type V1ContactRequest,
} from '@/lib/v1/dashboard/contact-requests';
import { ContactRequestCard } from './contact-request-card';

export const metadata = { title: 'Contactverzoeken · ChatManta' };
export const dynamic = 'force-dynamic';

export default async function V1ContactverzoekenPage() {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead eyebrow="Contactverzoeken" title="Geen toegang" subtitle="Je bent geen lid van deze organisatie." />
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  const enabled = chatbot
    ? (await getChatbotSettings(supabase, chatbot.id)).contactRequestsEnabled
    : false;

  if (!enabled) {
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

  const items = await listContactRequests(supabase, orgId);

  // Groepeer op status in de werkstroom-volgorde (Nieuw → Opgepakt → Afgehandeld);
  // binnen elke groep blijft de recent-eerst-volgorde uit de query behouden.
  const groups = STATUS_FLOW.map((status) => ({
    status,
    items: items.filter((r) => r.status === status),
  })).filter((g) => g.items.length > 0);

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
        groups.map((g) => (
          <section key={g.status} style={{ marginBottom: 22 }}>
            <h3 className="klant-section-title" style={{ marginBottom: 12 }}>
              {STATUS_LABEL[g.status]} ({g.items.length})
            </h3>
            <div className="contactverzoeken-list">
              {g.items.map((r: V1ContactRequest) => (
                <ContactRequestCard key={r.id} request={r} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
