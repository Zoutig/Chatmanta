// V1 admin — Maandelijkse Recap, detailpagina per klant per maand.
//
// Port van app/admindashboard/maandelijkse-recap/[orgSlug]/page.tsx.
// Aanpassingen t.o.v. V0:
//  - Route-param: [orgId] (UUID) i.p.v. [orgSlug].
//  - Org-naam uit DB (organizations-tabel) i.p.v. KNOWN_ORGS.
//  - PDF-link → /api/v1/pdf/recap/[orgId]/[month].
//  - Auth via getJorionAdminClient() (gooit AUTH_FORBIDDEN).
//  - Presentatie in de V1-ontwerplaag (golf 4b).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { isAppError } from '@/lib/errors/app-error';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { RECAP_SIGNAL_TYPE_LABELS } from '@/lib/controlroom/types';
import {
  buildMonthOptions,
  formatDuration,
  isCurrentMonth,
  lastCompleteMonth,
  monthLabelNL,
  parsePeriodMonth,
  periodMonthKey,
  type RecapSignal,
} from '@/lib/controlroom/recap-logic';
import { getV1RecapDetail, listRecapMonths } from '@/lib/v1/admin/recap';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { AttentionBlock, Badge, EmptyState } from '@/app/v1/_ui/feedback';
import { List, ListRow } from '@/app/v1/_ui/list';
import { Metric, MetricGrid } from '../../_ui/metric';
import { ReloadButton } from '../../_ui/reload-button';
import { DataTable } from '../../_ui/data-table';
import { formatDate } from '../../_ui/format';
import { MonthSelector } from './components/month-selector';
import { GenerateRecapButton } from './components/generate-recap-button';
import { SignalDot } from './components/signal-dot';
import { SignalActions } from './components/signal-actions';
import { NotesEditor } from './components/notes-editor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_PATH = '/v1/admin/maandelijkse-recap';

function SignalRow({
  sig,
  orgId,
  year,
  month,
}: {
  sig: RecapSignal;
  orgId: string;
  year: number;
  month: number;
}) {
  const dimmed = sig.status !== 'nieuw';
  return (
    <li>
      <div className="v1-list-row" style={{ opacity: dimmed ? 0.55 : 1 }}>
        <span className="v1-list-main">
          <span className="v1-adm-title-row">
            <SignalDot severity={sig.severity} showLabel={false} />
            <span className="v1-list-title v1-list-title--wrap">{RECAP_SIGNAL_TYPE_LABELS[sig.type]}</span>
          </span>
          <span className="v1-list-meta">{sig.message}</span>
          <span style={{ marginTop: 6 }}>
            <SignalActions orgId={orgId} year={year} month={month} signalType={sig.type} status={sig.status} />
          </span>
        </span>
      </div>
    </li>
  );
}

export default async function V1MaandRecapDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e;
  }

  const { orgId } = await params;

  // Valideer orgId + haal naam op uit DB.
  const { data: orgRow } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!orgRow) notFound();
  const orgName = String(orgRow.name);

  const sp = await searchParams;
  const parsed = sp.period ? parsePeriodMonth(sp.period) : null;
  const { year, month } = parsed ?? lastCompleteMonth();
  const currentKey = periodMonthKey(year, month);

  const [detail, archive] = await Promise.all([
    getV1RecapDetail(admin, orgId, orgName, year, month),
    listRecapMonths(admin, orgId),
  ]);
  const { stats, topQuestions, topUnanswered, signals, stored } = detail;
  const hasData = stats.totalConversations > 0;

  const options = buildMonthOptions(12);
  if (!options.some((o) => o.value === currentKey)) {
    options.unshift({ value: currentKey, label: monthLabelNL(year, month) });
  }

  return (
    <div className="v1-page">
      <Link href={`${BASE_PATH}?period=${currentKey}`} className="v1-section-link">
        Terug naar overzicht
      </Link>

      <PageHeader
        title={orgName}
        description={
          <>
            Recap {monthLabelNL(year, month)}
            {stored?.generatedAt ? ` · gegenereerd op ${formatDate(stored.generatedAt)}` : ''}
            {' · Gegenereerd door Niels Jochems, ChatManta'}
          </>
        }
        actions={
          <>
            <MonthSelector current={currentKey} options={options} basePath={`${BASE_PATH}/${orgId}`} />
            {hasData ? (
              <GenerateRecapButton orgId={orgId} year={year} month={month} hasRecap={stored?.generatedAt != null} />
            ) : null}
            <a
              className={buttonClass({ variant: 'secondary' })}
              href={`/api/v1/pdf/recap/${orgId}/${currentKey}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText size={15} strokeWidth={1.8} aria-hidden="true" />
              Exporteer als PDF
            </a>
            <ReloadButton />
          </>
        }
      />

      {isCurrentMonth(year, month) ? (
        <AttentionBlock level="attention" title="Dit is de lopende maand">
          De cijfers zijn nog onvolledig en veranderen dagelijks.
        </AttentionBlock>
      ) : null}

      {!hasData ? (
        <section className="v1-card">
          <EmptyState>
            Geen gesprekken gevonden voor {monthLabelNL(year, month)}. Er valt voor deze maand geen recap te genereren.
          </EmptyState>
        </section>
      ) : (
        <>
          {/* Sectie 1: statistieken */}
          <MetricGrid>
            <Metric label="Totaal gesprekken" value={stats.totalConversations} />
            <Metric label="Unieke bezoekers" value={stats.uniqueVisitors} sub="alleen websitebezoekers" />
            <Metric
              label="Gem. gespreksduur"
              value={formatDuration(stats.avgDurationSeconds)}
              sub="tijd tot laatste activiteit"
            />
            <Metric label="Gem. berichten/gesprek" value={stats.avgMessagesPerConversation} />
            <Metric
              label="Onbeantwoorde vragen"
              value={stats.unansweredCount}
              tone={stats.unansweredCount > 0 ? 'warn' : 'ink'}
            />
            <Metric
              label="Piekuur"
              value={stats.peakHour != null ? `${stats.peakHour}:00` : 'Onbekend'}
              sub="drukste uur (gesprek-starts)"
            />
          </MetricGrid>

          {/* Sectie 2: meest gestelde vragen */}
          <section className="v1-card">
            <h2 className="v1-section-title">Meest gestelde vragen</h2>
            {topQuestions.length > 0 ? (
              <List label="Meest gestelde vragen">
                {topQuestions.map((q, i) => (
                  <ListRow
                    key={i}
                    wrap
                    title={`${i + 1}. ${q.question}`}
                    end={
                      <>
                        <span className="v1-adm-muted">{q.count}×</span>
                        <Badge tone={q.answered ? 'ok' : 'warn'}>{q.answered ? 'Beantwoord' : 'Niet beantwoord'}</Badge>
                      </>
                    }
                  />
                ))}
              </List>
            ) : (
              <EmptyState>Geen vragen gevonden voor deze maand.</EmptyState>
            )}
          </section>

          {/* Sectie 3: meest voorkomende onbeantwoorde vragen */}
          <section className="v1-card">
            <h2 className="v1-section-title">Meest voorkomende onbeantwoorde vragen</h2>
            {topUnanswered.length > 0 ? (
              <List label="Meest voorkomende onbeantwoorde vragen">
                {topUnanswered.map((q, i) => (
                  <ListRow
                    key={i}
                    wrap
                    title={`${i + 1}. ${q.question}`}
                    end={<span className="v1-adm-muted">{q.count}×</span>}
                  />
                ))}
              </List>
            ) : (
              <EmptyState>Geen onbeantwoorde vragen. Mooi resultaat.</EmptyState>
            )}
          </section>
        </>
      )}

      {/* Sectie 4: AI-samenvatting */}
      <section className="v1-card">
        <h2 className="v1-section-title">AI-samenvatting</h2>
        {stored?.aiSummary ? (
          <>
            <p className="v1-adm-note">{stored.aiSummary}</p>
            {stored.generatedAt ? (
              <p className="v1-hint">Gegenereerd door AI op {formatDate(stored.generatedAt)}</p>
            ) : null}
          </>
        ) : (
          <EmptyState>
            {hasData
              ? "Nog geen samenvatting. Klik op 'Samenvatting maken'."
              : 'Geen samenvatting (geen gesprekken deze maand).'}
          </EmptyState>
        )}
      </section>

      {/* Sectie 5: signaleringen */}
      {signals.length > 0 ? (
        <section className="v1-card">
          <h2 className="v1-section-title">Signaleringen</h2>
          <ul className="v1-list" aria-label="Signaleringen">
            {signals.map((sig) => (
              <SignalRow key={sig.type} sig={sig} orgId={orgId} year={year} month={month} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Sectie 6: notities van Niels */}
      <section className="v1-card">
        <h2 className="v1-section-title">Notities</h2>
        {/* key op de recap-identiteit → remount bij maand-/klant-wissel */}
        <NotesEditor
          key={`${orgId}-${currentKey}`}
          orgId={orgId}
          year={year}
          month={month}
          initialNotes={stored?.nielsNotes ?? null}
        />
      </section>

      {/* Archief: eerdere recaps */}
      {archive.length > 0 ? (
        <section className="v1-card">
          <h2 className="v1-section-title">Eerdere recaps</h2>
          <DataTable
            label="Eerdere recaps"
            columns={[{ label: 'Maand' }, { label: 'Gegenereerd op' }, { label: 'Notitie' }, { label: 'Recap' }]}
          >
            {archive.map((a) => {
              const p = parsePeriodMonth(a.periodMonth);
              const label = p ? monthLabelNL(p.year, p.month) : a.periodMonth;
              return (
                <tr key={a.periodMonth}>
                  <td>{label}</td>
                  <td className="v1-adm-muted">{a.generatedAt ? formatDate(a.generatedAt) : 'Geen'}</td>
                  <td className="v1-adm-muted">{a.hasNotes ? 'Ja' : 'Nee'}</td>
                  <td>
                    <span className="v1-adm-inline">
                      <Link href={`${BASE_PATH}/${orgId}?period=${a.periodMonth}`} className="v1-section-link">
                        Bekijk
                      </Link>
                      <a
                        href={`/api/v1/pdf/recap/${orgId}/${a.periodMonth}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="v1-section-link"
                      >
                        PDF
                      </a>
                    </span>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </section>
      ) : null}
    </div>
  );
}
