// V1 admin — Maandrecap (overzicht alle klanten).
//  - Orgs uit de DB (organizations-tabel).
//  - Links naar [orgId] (UUID).
//  - Auth via getJorionAdminClient() (gooit AUTH_FORBIDDEN).

import Link from 'next/link';
import { isAppError } from '@/lib/errors/app-error';
import { getJorionAdminClient } from '@/lib/supabase/admin';
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
import { PageHeader } from '@/app/v1/_ui/page-header';
import { AttentionBlock, EmptyState, InfoTip } from '@/app/v1/_ui/feedback';
import { MonthSelector } from './[orgId]/components/month-selector';
import { GenerateRecapButton } from './[orgId]/components/generate-recap-button';
import { SignalDot } from './[orgId]/components/signal-dot';
import { ReloadButton } from '../_ui/reload-button';
import { DataTable, NumCell } from '../_ui/data-table';

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
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
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

  // Alle orgs; fan-out per org voor de recap-statistieken.
  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  const orgList = (orgs ?? []) as { id: string; name: string }[];

  const settled = await Promise.all(
    orgList.map((o) => getV1RecapOverviewRow(admin, o.id, o.name, year, month).catch(() => null)),
  );
  const rows = settled.filter((r): r is V1RecapOverviewRow => r != null);

  return (
    <div className="v1-page">
      <PageHeader
        title="Maandrecap"
        description="Per klant de kerncijfers van de maand, signaleringen en een AI-samenvatting."
        actions={
          <>
            <MonthSelector current={currentKey} options={options} basePath={BASE_PATH} />
            <ReloadButton />
          </>
        }
      />

      {isCur ? (
        <AttentionBlock level="attention" title="Dit is de lopende maand">
          De cijfers zijn nog niet compleet. Kies een afgesloten maand voor een definitieve recap.
        </AttentionBlock>
      ) : null}

      <section className="v1-card">
        {rows.length === 0 ? (
          <EmptyState>Geen klanten om te tonen.</EmptyState>
        ) : (
          <DataTable
            label="Maandrecap per klant"
            columns={[
              { label: 'Klant' },
              { label: 'Gesprekken', num: true },
              {
                label: (
                  <>
                    Bezoekers <InfoTip text="Alleen websitebezoekers. Intern testverkeer heeft geen bezoekerscookie en telt niet mee." />
                  </>
                ),
                num: true,
              },
              { label: 'Gem. duur', num: true },
              { label: 'Gem. berichten', num: true },
              { label: 'Onbeantwoord', num: true },
              { label: 'Signalering' },
              { label: 'Notitie' },
              { label: 'Samenvatting' },
            ]}
          >
            {rows.map((k) => {
              const detailHref = `${BASE_PATH}/${k.orgId}?period=${currentKey}`;
              const has = k.totalConversations > 0;
              return (
                <tr key={k.orgId}>
                  <td>
                    <Link href={detailHref} className="v1-adm-clip">
                      {k.name}
                    </Link>
                  </td>
                  <NumCell>{k.totalConversations}</NumCell>
                  <NumCell>{k.uniqueVisitors}</NumCell>
                  <NumCell>{has ? formatDuration(k.avgDurationSeconds) : 'Geen data'}</NumCell>
                  <NumCell>
                    {has ? k.avgMessagesPerConversation.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : 'Geen data'}
                  </NumCell>
                  <NumCell>{k.unansweredCount}</NumCell>
                  <td>
                    <SignalDot severity={k.signalSeverity} />
                  </td>
                  <td className="v1-adm-muted">{k.hasNotes ? 'Ja' : 'Nee'}</td>
                  <td>
                    <span className="v1-adm-inline">
                      <Link href={detailHref} className="v1-section-link">
                        Bekijken
                      </Link>
                      <GenerateRecapButton orgId={k.orgId} year={year} month={month} hasRecap={k.hasRecap} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </section>

      {rows.length < orgList.length ? (
        <p role="alert" className="v1-alert v1-alert--error">
          Sommige klanten konden niet worden geladen. Probeer het opnieuw met Herladen.
        </p>
      ) : null}
    </div>
  );
}
