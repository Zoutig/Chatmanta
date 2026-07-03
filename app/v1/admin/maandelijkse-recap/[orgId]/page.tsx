// V1 admin — Maandelijkse Recap, detailpagina per klant per maand.
//
// Port van app/admindashboard/maandelijkse-recap/[orgSlug]/page.tsx.
// Aanpassingen t.o.v. V0:
//  - Route-param: [orgId] (UUID) i.p.v. [orgSlug].
//  - Org-naam uit DB (organizations-tabel) i.p.v. KNOWN_ORGS.
//  - PDF-link → /api/v1/pdf/recap/[orgId]/[month].
//  - Auth via getJorionAdminClient() (gooit AUTH_FORBIDDEN).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isAppError } from '@/lib/errors/app-error';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { formatDateNL } from '@/lib/controlroom/format';
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
import { Card } from '@/app/klantendashboard/components/ui/card';
import { MetricCard } from '@/app/admindashboard/components/metric-card';
import { ReloadButton } from '@/app/admindashboard/components/reload-button';
import { MonthSelector } from './components/month-selector';
import { GenerateRecapButton } from './components/generate-recap-button';
import { SignalDot } from './components/signal-dot';
import { SignalActions } from './components/signal-actions';
import { NotesEditor } from './components/notes-editor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_PATH = '/v1/admin/maandelijkse-recap';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="klant-section-title" style={{ margin: '22px 0 10px' }}>
      {children}
    </div>
  );
}

function EmptyInline({ text }: { text: string }) {
  return <p style={{ fontSize: 13.5, color: 'var(--klant-dim)', margin: 0 }}>{text}</p>;
}

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
    <div
      style={{
        padding: '12px 0',
        borderTop: '1px solid var(--klant-border)',
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <SignalDot severity={sig.severity} showLabel={false} />
        <strong style={{ fontSize: 13.5 }}>{RECAP_SIGNAL_TYPE_LABELS[sig.type]}</strong>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--klant-muted)', margin: '0 0 8px' }}>
        {sig.message}
      </p>
      <SignalActions orgId={orgId} year={year} month={month} signalType={sig.type} status={sig.status} />
    </div>
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
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
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
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">{orgName}</h1>
          <p className="klant-page-sub">
            Recap {monthLabelNL(year, month)}
            {stored?.generatedAt
              ? ` · gegenereerd op ${formatDateNL(stored.generatedAt)}`
              : ''}
            {' · Gegenereerd door: Niels Jochems — ChatManta'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <MonthSelector
            current={currentKey}
            options={options}
            basePath={`${BASE_PATH}/${orgId}`}
          />
          {hasData ? (
            <GenerateRecapButton
              orgId={orgId}
              year={year}
              month={month}
              hasRecap={stored?.generatedAt != null}
            />
          ) : null}
          <a
            className="klant-btn"
            data-variant="ghost"
            href={`/api/v1/pdf/recap/${orgId}/${currentKey}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            📄 Exporteer als PDF
          </a>
          <ReloadButton />
        </div>
      </header>

      <p style={{ marginBottom: 16 }}>
        <Link
          href={`${BASE_PATH}?period=${currentKey}`}
          style={{ fontSize: 13, color: 'var(--klant-accent)', textDecoration: 'none' }}
        >
          ← Terug naar overzicht
        </Link>
      </p>

      {isCurrentMonth(year, month) ? (
        <p className="klant-hint" style={{ marginBottom: 14, color: 'var(--klant-warn)' }}>
          Lopende maand — de cijfers zijn nog onvolledig en veranderen dagelijks.
        </p>
      ) : null}

      {!hasData ? (
        <Card>
          <EmptyInline
            text={`Geen gesprekken gevonden voor ${monthLabelNL(year, month)}. Er valt voor deze maand geen recap te genereren.`}
          />
        </Card>
      ) : (
        <>
          {/* Sectie 1 — Statistieken */}
          <div className="klant-metrics-grid" style={{ marginBottom: 4 }}>
            <MetricCard label="Totaal gesprekken" value={stats.totalConversations} />
            <MetricCard
              label="Unieke bezoekers"
              value={stats.uniqueVisitors}
              sub="alleen website-bezoekers"
            />
            <MetricCard
              label="Gem. gespreksduur"
              value={formatDuration(stats.avgDurationSeconds)}
              sub="tijd tot laatste activiteit"
            />
            <MetricCard
              label="Gem. berichten/gesprek"
              value={stats.avgMessagesPerConversation}
            />
            <MetricCard
              label="Onbeantwoorde vragen"
              value={stats.unansweredCount}
              tone={stats.unansweredCount > 0 ? 'warn' : 'ink'}
            />
            <MetricCard
              label="Piekuur"
              value={stats.peakHour != null ? `${stats.peakHour}:00` : '—'}
              sub="drukste uur (gesprek-starts)"
            />
          </div>

          {/* Sectie 2 — Meest gestelde vragen */}
          <SectionTitle>Meest gestelde vragen</SectionTitle>
          <Card>
            {topQuestions.length > 0 ? (
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {topQuestions.map((q, i) => (
                  <li
                    key={i}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 13.5 }}
                  >
                    <span
                      style={{
                        color: 'var(--klant-dim)',
                        fontVariantNumeric: 'tabular-nums',
                        width: 22,
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ flex: 1, color: 'var(--klant-ink)' }}>{q.question}</span>
                    <span
                      style={{ color: 'var(--klant-dim)', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {q.count}×
                    </span>
                    <span
                      style={{
                        color: q.answered ? 'var(--klant-success)' : 'var(--klant-warn)',
                        fontSize: 12.5,
                        minWidth: 110,
                        textAlign: 'right',
                      }}
                    >
                      {q.answered ? 'beantwoord' : 'niet beantwoord ⚠️'}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyInline text="Geen vragen gevonden voor deze maand." />
            )}
          </Card>

          {/* Sectie 3 — Meest voorkomende onbeantwoorde vragen */}
          <SectionTitle>Meest voorkomende onbeantwoorde vragen</SectionTitle>
          <Card>
            {topUnanswered.length > 0 ? (
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {topUnanswered.map((q, i) => (
                  <li
                    key={i}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 13.5 }}
                  >
                    <span
                      style={{
                        color: 'var(--klant-dim)',
                        fontVariantNumeric: 'tabular-nums',
                        width: 22,
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ flex: 1, color: 'var(--klant-ink)' }}>{q.question}</span>
                    <span
                      style={{ color: 'var(--klant-dim)', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {q.count}×
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyInline text="Geen onbeantwoorde vragen — mooi resultaat." />
            )}
          </Card>
        </>
      )}

      {/* Sectie 4 — AI-samenvatting */}
      <SectionTitle>AI-samenvatting</SectionTitle>
      <Card>
        {stored?.aiSummary ? (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--klant-ink)', margin: 0 }}>
              {stored.aiSummary}
            </p>
            {stored.generatedAt ? (
              <div className="klant-hint" style={{ marginTop: 10 }}>
                Gegenereerd door AI op {formatDateNL(stored.generatedAt)}
              </div>
            ) : null}
          </>
        ) : (
          <EmptyInline
            text={
              hasData
                ? "Nog geen samenvatting — klik op 'Recap genereren'."
                : 'Geen samenvatting (geen gesprekken deze maand).'
            }
          />
        )}
      </Card>

      {/* Sectie 5 — Signaleringen */}
      {signals.length > 0 ? (
        <>
          <SectionTitle>Signaleringen</SectionTitle>
          <Card>
            <div style={{ marginTop: -12 }}>
              {signals.map((sig) => (
                <SignalRow key={sig.type} sig={sig} orgId={orgId} year={year} month={month} />
              ))}
            </div>
          </Card>
        </>
      ) : null}

      {/* Sectie 6 — Notities van Niels */}
      <SectionTitle>Notities</SectionTitle>
      <Card>
        {/* key op de recap-identiteit → remount bij maand-/klant-wissel */}
        <NotesEditor
          key={`${orgId}-${currentKey}`}
          orgId={orgId}
          year={year}
          month={month}
          initialNotes={stored?.nielsNotes ?? null}
        />
      </Card>

      {/* Archief — Eerdere recaps */}
      {archive.length > 0 ? (
        <>
          <SectionTitle>Eerdere recaps</SectionTitle>
          <Card padded={false}>
            <div style={{ overflowX: 'auto' }}>
              <table className="klant-table">
                <thead>
                  <tr>
                    <th>Maand</th>
                    <th>Gegenereerd op</th>
                    <th>Notitie</th>
                    <th>Recap</th>
                  </tr>
                </thead>
                <tbody>
                  {archive.map((a) => {
                    const p = parsePeriodMonth(a.periodMonth);
                    const label = p ? monthLabelNL(p.year, p.month) : a.periodMonth;
                    return (
                      <tr key={a.periodMonth}>
                        <td style={{ fontSize: 13 }}>{label}</td>
                        <td style={{ fontSize: 13 }}>
                          {a.generatedAt ? formatDateNL(a.generatedAt) : '—'}
                        </td>
                        <td style={{ fontSize: 13 }}>{a.hasNotes ? '✏️' : '—'}</td>
                        <td>
                          <span style={{ display: 'inline-flex', gap: 12 }}>
                            <Link
                              href={`${BASE_PATH}/${orgId}?period=${a.periodMonth}`}
                              style={{
                                fontSize: 13,
                                color: 'var(--klant-accent)',
                                textDecoration: 'none',
                                fontWeight: 600,
                              }}
                            >
                              Bekijk
                            </Link>
                            <a
                              href={`/api/v1/pdf/recap/${orgId}/${a.periodMonth}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: 13,
                                color: 'var(--klant-accent)',
                                textDecoration: 'none',
                                fontWeight: 600,
                              }}
                            >
                              PDF
                            </a>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}
