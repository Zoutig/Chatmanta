// Voorbeeld-dashboard: Contactverzoeken (inbox + werkstroom).
//
// Zelfde opbouw als de V1-pagina, maar de lijst komt uit vaste voorbeelddata plus
// de verzoeken die de bezoeker zelf via de voorbeeldwidget instuurde (demo-store).
// Omdat die en de contact-toggle in de browser leven, rendert een client-view.
// Het statusfilter (?status=) filtert alleen de weergave.

import { STATUS_FLOW, type V1ContactRequestStatus } from '@/lib/v1/dashboard/contact-requests';
import { ContactRequestsView, type ContactFilter } from './contact-requests-view';
import './contactverzoeken.css';

export const metadata = { title: 'Contactverzoeken · ChatManta' };

function parseFilter(raw: string | undefined): ContactFilter {
  return STATUS_FLOW.includes(raw as V1ContactRequestStatus) ? (raw as V1ContactRequestStatus) : 'all';
}

export default async function VoorbeeldContactverzoekenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const filter = parseFilter((await searchParams).status);
  return <ContactRequestsView filter={filter} />;
}
