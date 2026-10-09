'use client';

// Client-weergave van de Contactverzoeken-pagina in het voorbeeld. Opbouw en teksten
// gelijk aan de V1-pagina; de data is: eigen verzoeken van de bezoeker (demo-store)
// bovenaan, daarna de vaste voorbeeldverzoeken (met wijzigingen uit deze sessie).

import { useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';

import { PageHeader } from '@/app/v1/_ui/page-header';
import { Button, buttonClass } from '@/app/v1/_ui/button';
import { EmptyState } from '@/app/v1/_ui/feedback';
import { LinkTabs } from '@/app/v1/_ui/tabs';
import {
  STATUS_FLOW,
  STATUS_LABEL,
  type V1ContactRequest,
  type V1ContactRequestStatus,
} from '@/lib/v1/dashboard/contact-requests';
import { useDemoContactRequests, useDemoSettings } from '@/lib/voorbeeld/demo-store';
import { getContactFixtures } from '@/lib/voorbeeld/fixtures/contact';
import { ContactRequestCard } from './contact-request-card';
import {
  applyFixtureOverrides,
  getFixtureOverrides,
  getServerFixtureOverrides,
  subscribeFixtureOverrides,
} from './fixture-overrides';

export type ContactFilter = 'all' | V1ContactRequestStatus;

const BASE = '/voorbeeld/contactverzoeken';
const SETTINGS_HREF = '/voorbeeld/instellingen#contact';

function csvCell(v: string | null): string {
  const s = v ?? '';
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(items: V1ContactRequest[]) {
  const header = ['Datum', 'Naam', 'E-mail', 'Telefoon', 'Voorkeur', 'Onderwerp', 'Bericht', 'Status', 'Notitie'];
  const rows = items.map((r) =>
    [
      r.createdAt,
      r.name,
      r.email,
      r.phone,
      r.preferredContact === 'call' ? 'Bellen' : 'Mailen',
      r.subject,
      r.message,
      STATUS_LABEL[r.status],
      r.notes,
    ]
      .map(csvCell)
      .join(','),
  );
  const blob = new Blob(['﻿' + [header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'contactverzoeken-voorbeeld.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ContactRequestsView({ filter }: { filter: ContactFilter }) {
  const { contactRequestsEnabled: enabled } = useDemoSettings();
  const own = useDemoContactRequests();
  const overrides = useSyncExternalStore(
    subscribeFixtureOverrides,
    getFixtureOverrides,
    getServerFixtureOverrides,
  );
  const fixtures = useMemo(() => getContactFixtures(), []);
  const items = useMemo(
    () => [...own, ...applyFixtureOverrides(fixtures, overrides)],
    [own, fixtures, overrides],
  );

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

  // Op "Alle" in werkstroom-volgorde (Nieuw → Opgepakt → Afgehandeld); binnen
  // elke status blijft de recent-eerst-volgorde behouden.
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
            <Button
              variant="secondary"
              title="Exporteert maximaal 5.000 verzoeken als CSV"
              onClick={() => downloadCsv(items)}
            >
              Exporteer CSV
            </Button>
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
