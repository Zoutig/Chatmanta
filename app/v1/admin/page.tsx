// V1 admin — Overzicht (landing op /v1/admin). Cross-org startscherm: cijfers en
// aandachtslijsten, afgeleid uit V1-data + de admin-overlay. Kosten in EUR (V1
// logt cost_eur); klant-links via UUID org-id.

import Link from 'next/link';
import { isAppError } from '@/lib/errors/app-error';
import { formatRelativeNL } from '@/lib/controlroom/format';
import {
  getControlRoomKlanten,
  buildOverviewSummary,
  getDailyCostThisMonth,
  getMonthlyFirecrawlCredits,
  type ControlRoomKlant,
} from '@/lib/v1/admin/overview';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { InfoTip } from '@/app/v1/_ui/feedback';
import { Metric, MetricGrid } from './_ui/metric';
import { HealthBadge } from './_ui/status-badges';
import { ReloadButton } from './_ui/reload-button';
import { LineChart } from './_ui/line-chart';
import { formatEur } from './_ui/format';

export const dynamic = 'force-dynamic';

function KlantRow({ k, meta }: { k: ControlRoomKlant; meta?: string }) {
  return (
    <li>
      <Link href={`/v1/admin/organizations/${k.orgId}`} className="v1-list-row v1-list-row--link">
        <HealthBadge status={k.health} />
        <span className="v1-list-main">
          <span className="v1-list-title">{k.name}</span>
        </span>
        {meta ? <span className="v1-list-meta">{meta}</span> : null}
      </Link>
    </li>
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
    <section className="v1-card">
      <h2 className="v1-section-title">{title}</h2>
      {items.length === 0 ? (
        <p className="v1-empty-text v1-adm-empty">{emptyText}</p>
      ) : (
        <ul className="v1-list">
          {items.map((k) => (
            <KlantRow key={k.orgId} k={k} meta={metaFn?.(k)} />
          ))}
        </ul>
      )}
    </section>
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
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e; // NEXT_REDIRECT (geen sessie) -> /v1/login
  }

  const s = buildOverviewSummary(klanten);

  return (
    <div className="v1-page">
      <PageHeader
        title="Overzicht"
        description="Welke klanten hebben aandacht nodig? Status, crawls, gesprekken en kosten van alle klanten."
        actions={
          <>
            <ReloadButton />
            <Link href="/v1/admin/organizations" className={buttonClass()}>
              Alle klanten
            </Link>
          </>
        }
      />

      <MetricGrid>
        <Metric label="Klanten" value={s.totalCustomers} sub={`${s.activeCustomers} actief, ${s.trials} in proefperiode`} />
        <Metric
          label="Aandacht nodig"
          value={s.needAttention}
          tone={s.needAttention > 0 ? 'warn' : 'ok'}
          sub={`${s.withErrors} met een fout`}
        />
        <Metric
          label="Mislukte crawls"
          value={s.crawlsFailed}
          tone={s.crawlsFailed > 0 ? 'danger' : 'ok'}
          sub={`${s.crawlsRunning} bezig`}
        />
        <Metric label="Gesprekken deze week" value={s.conversationsThisWeek} sub={`${s.conversationsThisMonth} deze maand`} />
        <Metric
          label="Kosten klant-chatbots deze maand"
          value={formatEur(s.monthCostEur)}
          sub="Zonder evaluaties"
        />
        <Metric
          label="Firecrawl-tegoed"
          value={`${credits.used} / ${credits.limit}`}
          tone={credits.tone}
          sub={
            credits.source === 'firecrawl'
              ? `${credits.pct}%, live${credits.remaining != null ? `, ${credits.remaining} over` : ''}`
              : `${credits.pct}%, geschat uit de logs`
          }
        />
      </MetricGrid>

      <LineChart
        points={dailyCost.points.map((p) => ({ date: p.date, label: p.dayLabel, value: p.costEur }))}
        title="Verbruik klant-chatbots per dag"
        formatValue={formatEur}
        gradientId="v1-adm-overview-cost"
        headerRight={
          <>
            Totaal deze maand: <strong>{formatEur(dailyCost.totalEur)}</strong>
          </>
        }
        emptyText="Nog geen verbruik deze maand."
        ariaLabel={`Lijngrafiek van het dagelijkse verbruik van de klant-chatbots deze maand, totaal ${formatEur(dailyCost.totalEur)}`}
        footnote={
          <>
            Uit de tokentelling per gesprek, zonder evaluaties.{' '}
            <InfoTip text="Embedding, herformulering, rerank, antwoord en vervolgvragen, berekend uit query_log. Het volledige OpenAI-accountbedrag staat bij Gebruik en kosten." />{' '}
            <Link href="/v1/admin/usage" className="v1-section-link">
              Gebruik en kosten
            </Link>
          </>
        }
      />

      <ListCard
        title="Klanten die aandacht nodig hebben"
        items={s.attention}
        metaFn={(k) => k.healthReasons[0] ?? ''}
        emptyText="Alle klanten zijn gezond."
      />

      <div className="v1-adm-grid-2">
        <ListCard
          title="Mislukte crawls"
          items={s.failedCrawls}
          metaFn={(k) => k.crawlError ?? 'Crawl mislukt'}
          emptyText="Geen mislukte crawls."
        />
        <ListCard
          title="Widget nog niet live"
          items={s.widgetNotLive}
          metaFn={(k) => (k.widgetStatus === 'detected' ? 'Gevonden, niet actief' : 'Niet geplaatst')}
          emptyText="Alle actieve klanten en proefklanten hebben een live widget."
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
    </div>
  );
}
