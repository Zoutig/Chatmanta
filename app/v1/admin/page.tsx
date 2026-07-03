// V1 admin — Overview (landing op /v1/admin). Cross-org control-room startscherm:
// kaart-cijfers + aandachtslijsten, afgeleid uit V1-data + de admin-overlay.
// Faithful port van app/admindashboard/page.tsx; kosten in EUR (V1 logt cost_eur),
// klant-links via UUID org-id (V1 heeft geen slug-routing in admin).

import Link from 'next/link';
import { isAppError } from '@/lib/errors/app-error';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { MetricCard } from '@/app/admindashboard/components/metric-card';
import { HealthBadge } from '@/app/admindashboard/components/badges';
import { ReloadButton } from '@/app/admindashboard/components/reload-button';
import { DailyLineChart } from '@/app/admindashboard/components/daily-line-chart';
import { formatRelativeNL } from '@/lib/controlroom/format';
import {
  getControlRoomKlanten,
  buildOverviewSummary,
  getDailyCostThisMonth,
  getMonthlyFirecrawlCredits,
  type ControlRoomKlant,
} from '@/lib/v1/admin/overview';

export const dynamic = 'force-dynamic';

/** Kleine bedragen -> 3 decimalen (spiegelt formatCostUsd, maar in EUR). */
const fmtEur = (n: number): string => `€${n.toFixed(n < 1 ? 3 : 2)}`;

function KlantLine({ k, meta }: { k: ControlRoomKlant; meta?: string }) {
  return (
    <Link
      href={`/v1/admin/organizations/${k.orgId}`}
      className="klant-convo-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 10px',
        borderRadius: 'var(--klant-r-md)',
        textDecoration: 'none',
        color: 'var(--klant-ink)',
      }}
    >
      <HealthBadge status={k.health} />
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{k.name}</span>
      {meta ? (
        <span style={{ fontSize: 12, color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}>{meta}</span>
      ) : null}
    </Link>
  );
}

function ListCard({
  title,
  items,
  metaFn,
  emptyText,
}: {
  title: string;
  items: ControlRoomKlant[];
  metaFn?: (k: ControlRoomKlant) => string;
  emptyText: string;
}) {
  return (
    <Card>
      <div className="klant-section-title">{title}</div>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--klant-dim)', margin: '8px 0 0' }}>{emptyText}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
          {items.map((k) => (
            <KlantLine key={k.orgId} k={k} meta={metaFn?.(k)} />
          ))}
        </div>
      )}
    </Card>
  );
}

export default async function V1AdminOverviewPage() {
  let klanten: ControlRoomKlant[];
  let credits: Awaited<ReturnType<typeof getMonthlyFirecrawlCredits>>;
  let dailyCost: Awaited<ReturnType<typeof getDailyCostThisMonth>>;
  try {
    [klanten, credits, dailyCost] = await Promise.all([
      getControlRoomKlanten(),
      getMonthlyFirecrawlCredits(),
      getDailyCostThisMonth(),
    ]);
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) -> /v1/login
  }

  const s = buildOverviewSummary(klanten);

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Overview</h1>
          <p className="klant-page-sub">
            Welke klanten hebben aandacht nodig? Status, crawls, gesprekken en kosten over alle orgs
            in een oogopslag.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <ReloadButton />
          <Link href="/v1/admin/organizations" className="klant-btn" data-variant="primary">
            Alle klanten &rarr;
          </Link>
        </div>
      </header>

      {/* Kaart-cijfers */}
      <div className="klant-metrics-grid" style={{ marginBottom: 24 }}>
        <MetricCard label="Klanten" value={s.totalCustomers} sub={`${s.activeCustomers} actief · ${s.trials} trial`} />
        <MetricCard
          label="Aandacht nodig"
          value={s.needAttention}
          tone={s.needAttention > 0 ? 'warn' : 'success'}
          sub={`${s.withErrors} met error`}
        />
        <MetricCard
          label="Crawls gefaald"
          value={s.crawlsFailed}
          tone={s.crawlsFailed > 0 ? 'danger' : 'success'}
          sub={`${s.crawlsRunning} bezig`}
        />
        <MetricCard label="Gesprekken (deze week)" value={s.conversationsThisWeek} sub={`${s.conversationsThisMonth} deze maand`} />
        <MetricCard label="Kosten klant-chatbots (deze maand)" value={fmtEur(s.monthCostEur)} sub="EUR · evals niet meegerekend" />
        <MetricCard
          label="Firecrawl-credits"
          value={`${credits.used} / ${credits.limit}`}
          sub={
            credits.source === 'firecrawl'
              ? `${credits.pct}% • live${credits.remaining != null ? ` · ${credits.remaining} resterend` : ''}`
              : `${credits.pct}% • schatting (logs)`
          }
          tone={credits.tone}
        />
      </div>

      {/* Verbruik-grafiek — klant-chatbots per dag (EUR) */}
      <div style={{ marginBottom: 16 }}>
        <DailyLineChart
          points={dailyCost.points.map((p) => ({ date: p.date, label: p.dayLabel, value: p.costEur }))}
          title="Klant-chatbot-verbruik per dag (deze maand)"
          formatValue={fmtEur}
          gradientId="v1-admin-usage-area"
          headerRight={
            <>
              Totaal deze maand:{' '}
              <strong style={{ color: 'var(--klant-ink)' }}>{fmtEur(dailyCost.totalEur)}</strong>
            </>
          }
          emptyText="Nog geen verbruik deze maand."
          ariaLabel={`Lijngrafiek van dagelijks klant-chatbot-verbruik deze maand, totaal ${fmtEur(dailyCost.totalEur)}`}
          footnote={
            <>
              Dagelijkse kosten van de klant-chatbots (embedding + rewrite/HyDE + rerank + antwoord +
              follow-ups), berekend uit de token-telling per gesprek in query_log. Eval-/judge-kosten
              tellen hier niet mee. Voor het totale OpenAI-accountbedrag zie{' '}
              <Link href="/v1/admin/usage" style={{ color: 'var(--klant-accent)' }}>
                Usage &amp; Kosten
              </Link>
              .
            </>
          }
        />
      </div>

      {/* Aandacht nodig — volle breedte */}
      <div style={{ marginBottom: 16 }}>
        <ListCard
          title="Klanten die aandacht nodig hebben"
          items={s.attention}
          metaFn={(k) => k.healthReasons[0] ?? ''}
          emptyText="Alle klanten zijn gezond. 🎉"
        />
      </div>

      {/* Aandachtslijsten — 2 kolommen */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <ListCard
          title="Gefaalde crawls"
          items={s.failedCrawls}
          metaFn={(k) => k.crawlError ?? 'crawl gefaald'}
          emptyText="Geen gefaalde crawls."
        />
        <ListCard
          title="Widget nog niet live"
          items={s.widgetNotLive}
          metaFn={(k) => (k.widgetStatus === 'detected' ? 'gevonden, niet actief' : 'niet geplaatst')}
          emptyText="Alle actieve/trial-klanten hebben een live widget."
        />
        <ListCard
          title="Onbeantwoorde vragen"
          items={s.withUnanswered}
          metaFn={(k) => `${k.unansweredCount} open`}
          emptyText="Geen onbeantwoorde vragen."
        />
        <ListCard
          title="Geen recente activiteit"
          items={s.noRecentActivity}
          metaFn={(k) => formatRelativeNL(k.lastActivityAt)}
          emptyText="Alle klanten zijn recent actief geweest."
        />
      </div>
    </>
  );
}
