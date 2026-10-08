// V1 Klantendashboard: Contactverzoeken (inbox + werkstroom).
//
// Auth-keten = die van /v1/app (getSessionOrg). Org uit de sessie. De lijst leest
// onder de session-client (RLS, org-leden-SELECT): ECHTE bezoekers-PII, dus
// nooit service-role hier. Status/notitie/wissen lopen via de gegate server-actions.
//
// De pagina toont alléén data als de contactverzoeken-toggle aan staat; staat 'ie uit
// dan tonen we een lege staat (een directe URL mag geen rauwe data tonen).
// Het statusfilter (?status=) filtert alleen de weergave; de query blijft gelijk.

import Link from 'next/link';

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { EmptyState } from '@/app/v1/_ui/feedback';
import { LinkTabs } from '@/app/v1/_ui/tabs';
import { getOrgChatbot } from '../rag-config';
import { getChatbotSettings } from '../instellingen/settings-config';
import {
  listContactRequests,
  STATUS_FLOW,
  STATUS_LABEL,
  type V1ContactRequestStatus,
} from '@/lib/v1/dashboard/contact-requests';
import { ContactRequestCard } from './contact-request-card';
import './contactverzoeken.css';

export const metadata = { title: 'Contactverzoeken · ChatManta' };
export const dynamic = 'force-dynamic';

const BASE = '/v1/app/contactverzoeken';
const SETTINGS_HREF = '/v1/app/instellingen#contact';

type Filter = 'all' | V1ContactRequestStatus;

function parseFilter(raw: string | undefined): Filter {
  return STATUS_FLOW.includes(raw as V1ContactRequestStatus) ? (raw as V1ContactRequestStatus) : 'all';
}

export default async function V1ContactverzoekenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <div className="v1-page">
          <PageHeader title="Geen toegang" description="Je bent geen lid van deze organisatie." />
        </div>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  const enabled = chatbot
    ? (await getChatbotSettings(supabase, chatbot.id)).contactRequestsEnabled
    : false;

  const settingsLink = (
    <Link href={SETTINGS_HREF} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
      Naar Chatbot › Contact
    </Link>
  );

  if (!enabled) {
    return (
      <div className="v1-page">
        <PageHeader
          title="Contactverzoeken"
          description="Bezoekers die via je chatbot om contact vragen."
        />
        <div className="v1-card">
          <EmptyState action={settingsLink}>
            Contactverzoeken staat uit. Zet ze aan bij Chatbot › Contact.
          </EmptyState>
        </div>
      </div>
    );
  }

  const items = await listContactRequests(supabase, orgId);
  const filter = parseFilter((await searchParams).status);

  // Op "Alle" in werkstroom-volgorde (Nieuw → Opgepakt → Afgehandeld); binnen
  // elke status blijft de recent-eerst-volgorde uit de query behouden.
  const shown =
    filter === 'all'
      ? STATUS_FLOW.flatMap((s) => items.filter((r) => r.status === s))
      : items.filter((r) => r.status === filter);

  const tabs = [
    { id: 'all', label: 'Alle', count: items.length, href: BASE },
    ...STATUS_FLOW.map((s) => ({
      id: s,
      label: STATUS_LABEL[s],
      count: items.filter((r) => r.status === s).length,
      href: `${BASE}?status=${s}`,
    })),
  ];

  return (
    <div className="v1-page">
      <PageHeader
        title="Contactverzoeken"
        description="Bezoekers die via je chatbot om contact vragen, van nieuw tot afgehandeld."
        actions={
          items.length > 0 ? (
            <a
              href={`${BASE}/export`}
              className={buttonClass({ variant: 'secondary' })}
              title="Exporteert maximaal 5.000 verzoeken als CSV"
            >
              Exporteer CSV
            </a>
          ) : null
        }
      />

      {items.length === 0 ? (
        <div className="v1-card">
          <EmptyState action={settingsLink}>
            Nog geen contactverzoeken. Vraagt een bezoeker via je chatbot om contact, dan zie je dat hier.
          </EmptyState>
        </div>
      ) : (
        <>
          <LinkTabs items={tabs} active={filter} label="Filter op status" />
          {shown.length === 0 ? (
            <div className="v1-card">
              <EmptyState>
                Geen verzoeken met status {STATUS_LABEL[filter as V1ContactRequestStatus].toLowerCase()}.
              </EmptyState>
            </div>
          ) : (
            <ul className="v1-cv-list" aria-label="Contactverzoeken">
              {shown.map((r) => (
                <li key={r.id}>
                  <ContactRequestCard request={r} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
