// Admin Dashboard — Overview (MD §6). Cross-org control-room startscherm:
// kaart-cijfers + aandachtslijsten, alles afgeleid uit bestaande data + de
// admin-overlay. Linkt door naar de klantdetailpagina's.

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import {
  buildOverviewSummary,
  getControlRoomKlanten,
} from '@/lib/controlroom/server/overview';
import type { ControlRoomKlant } from '@/lib/controlroom/server/signals';
import { getMonthlyFirecrawlCredits } from '@/lib/controlroom/server/credits';
import { formatCostUsd, formatRelativeNL } from '@/lib/controlroom/format';
import { MetricCard } from './components/metric-card';
import { HealthBadge } from './components/badges';
import { ReloadButton } from './components/reload-button';

export const dynamic = 'force-dynamic';

function KlantLine({ k, meta }: { k: ControlRoomKlant; meta?: string }) {
  return (
    <Link
      href={`/admindashboard/klanten/${k.slug}`}
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
            <KlantLine key={k.slug} k={k} meta={metaFn?.(k)} />
          ))}
        </div>
      )}
    </Card>
  );
}

export default async function ControlRoomOverviewPage() {
  const [klanten, credits] = await Promise.all([getControlRoomKlanten(), getMonthlyFirecrawlCredits()]);
  const s = buildOverviewSummary(klanten);

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Overview</h1>
          <p className="klant-page-sub">
            Welke testklanten hebben aandacht nodig? Status, crawls, gesprekken en kosten over alle
            orgs in één oogopslag.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <ReloadButton />
          <Link href="/admindashboard/klanten" className="klant-btn" data-variant="primary">
            Alle klanten →
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
        <MetricCard label="Kosten (deze maand)" value={formatCostUsd(s.monthCostUsd)} sub="geschat, USD" />
        <MetricCard
          label="Firecrawl-credits"
          value={`${credits.used} / ${credits.limit}`}
          sub={`${credits.pct}% deze maand`}
          tone={credits.tone}
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
