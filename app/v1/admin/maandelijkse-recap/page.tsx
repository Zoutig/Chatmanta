// V1 admin — Maandelijkse Recap (overzicht alle klanten).
//
// Port van app/admindashboard/maandelijkse-recap/page.tsx.
// Aanpassingen t.o.v. V0:
//  - Orgs uit DB (organizations-tabel) i.p.v. KNOWN_ORGS.
//  - Links naar [orgId] (UUID) i.p.v. [orgSlug].
//  - Auth via getJorionAdminClient() (gooit AUTH_FORBIDDEN).

import Link from 'next/link';
import { isAppError } from '@/lib/errors/app-error';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import {
  buildMonthOptions,
  formatDuration,
  isCurrentMonth,
  lastCompleteMonth,
  monthLabelNL,
  parsePeriodMonth,
  periodMonthKey,
} from '@/lib/controlroom/recap-logic';
import { getV1RecapOverviewRow, type V1RecapOverviewRow } from '@/lib/v1/admin/recap';
import { MonthSelector } from './[orgId]/components/month-selector';
import { GenerateRecapButton } from './[orgId]/components/generate-recap-button';
import { SignalDot } from './[orgId]/components/signal-dot';
import { ReloadButton } from '@/app/admindashboard/components/reload-button';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_PATH = '/v1/admin/maandelijkse-recap';

export default async function V1MaandRecapOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }

  const sp = await searchParams;
  const parsed = sp.period ? parsePeriodMonth(sp.period) : null;
  const { year, month } = parsed ?? lastCompleteMonth();
  const currentKey = periodMonthKey(year, month);
  const isCur = isCurrentMonth(year, month);

  const options = buildMonthOptions(12);
  if (!options.some((o) => o.value === currentKey)) {
    options.unshift({ value: currentKey, label: monthLabelNL(year, month) });
  }

  // Haal alle orgs op; fan-out per org voor de recap-statistieken.
  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  const orgList = (orgs ?? []) as { id: string; name: string }[];

  const settled = await Promise.all(
    orgList.map((o) =>
      getV1RecapOverviewRow(admin, o.id, o.name, year, month).catch(() => null),
    ),
  );
  const rows = settled.filter((r): r is V1RecapOverviewRow => r != null);

  return (
    <>
      <PageHead
        title="Maandelijkse Recap"
        subtitle="Maandoverzicht per klant: kerncijfers, signaleringen en een AI-samenvatting."
        actions={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <MonthSelector current={currentKey} options={options} basePath={BASE_PATH} />
            <ReloadButton />
          </span>
        }
      />

      {isCur ? (
        <p className="klant-hint" style={{ marginBottom: 14, color: 'var(--klant-warn)' }}>
          Let op: dit is de lopende maand — de cijfers zijn nog onvolledig en veranderen dagelijks.
          Kies een afgesloten maand voor een definitieve recap.
        </p>
      ) : null}

      <Card padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Gesprekken</th>
                <th>Bezoekers</th>
                <th>Gem. duur</th>
                <th>Gem. berichten</th>
                <th>Onbeantwoord</th>
                <th>Signalering</th>
                <th>Notitie</th>
                <th>Recap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => {
                const detailHref = `${BASE_PATH}/${k.orgId}?period=${currentKey}`;
                return (
                  <tr key={k.orgId}>
                    <td>
                      <Link
                        href={detailHref}
                        style={{
                          textDecoration: 'none',
                          color: 'var(--klant-ink)',
                          fontWeight: 600,
                          fontSize: 13.5,
                        }}
                      >
                        {k.name}
                      </Link>
                    </td>
                    <td style={{ fontSize: 13 }}>{k.totalConversations}</td>
                    <td style={{ fontSize: 13 }}>{k.uniqueVisitors}</td>
                    <td style={{ fontSize: 13 }}>
                      {k.totalConversations > 0 ? formatDuration(k.avgDurationSeconds) : '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {k.totalConversations > 0 ? k.avgMessagesPerConversation : '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>{k.unansweredCount}</td>
                    <td>
                      <SignalDot severity={k.signalSeverity} />
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {k.hasNotes ? (
                        <span title="Notitie toegevoegd" aria-label="Notitie toegevoegd">
                          ✏️
                        </span>
                      ) : (
                        <span style={{ color: 'var(--klant-faint)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Link
                          href={detailHref}
                          style={{
                            fontSize: 13,
                            color: 'var(--klant-accent)',
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          Bekijk →
                        </Link>
                        <GenerateRecapButton
                          orgId={k.orgId}
                          year={year}
                          month={month}
                          hasRecap={k.hasRecap}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {rows.length < orgList.length ? (
        <p className="klant-hint" style={{ marginTop: 12 }}>
          Sommige klanten konden niet worden geladen — probeer te herladen.
        </p>
      ) : null}

      <p className="klant-hint" style={{ marginTop: 12 }}>
        🟢 geen bijzonderheden · 🟡 let op · 🔴 actie vereist. "Bezoekers" telt alleen
        website-bezoekers (intern testverkeer heeft geen bezoeker-cookie en telt niet mee).
      </p>
    </>
  );
}
