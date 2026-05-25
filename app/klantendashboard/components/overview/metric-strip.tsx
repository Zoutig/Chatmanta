// MetricStrip — 4 kerncijfers boven de vouw op Overzicht. Server-component.
// Gesprekken-kaart heeft een sparkline (14d) + week-delta; de rest toont een
// sub-regel. Lege org → 0-waarden + "nog geen feedback"-staat.

import type { ReactNode } from 'react';
import { Card } from '../ui/card';
import { Sparkline } from '../ui/sparkline';
import type { OverviewMetrics } from '@/lib/v0/klantendashboard/types';

export function MetricStrip({ metrics }: { metrics: OverviewMetrics }) {
  const sources =
    metrics.sources.websitePages + metrics.sources.documents + metrics.sources.qaItems;
  const delta = metrics.conversationsWeekDelta.deltaPct;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 12,
      }}
    >
      <MetricCard
        label="Gesprekken"
        value={String(metrics.conversationsThisMonth.threads)}
        delta={
          delta === null
            ? undefined
            : { text: `${Math.abs(delta)}%`, dir: delta >= 0 ? 'up' : 'down' }
        }
        spark={metrics.conversationsTrend}
      />
      <MetricCard
        label="Behulpzaam"
        value={metrics.helpfulness.rate === null ? '—' : `${metrics.helpfulness.rate}%`}
        sub={
          metrics.helpfulness.total > 0
            ? `op ${metrics.helpfulness.total} gesprek${metrics.helpfulness.total === 1 ? '' : 'ken'}`
            : 'nog geen gesprekken'
        }
      />
      <MetricCard
        label="Berichten"
        value={metrics.conversationsThisMonth.messages.toLocaleString('nl-NL')}
        sub="deze maand"
      />
      <MetricCard
        label="Actieve bronnen"
        value={String(sources)}
        sub={`${metrics.sources.websitePages} pagina's · ${metrics.sources.documents} docs · ${metrics.sources.qaItems} Q&A`}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  delta,
  spark,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  delta?: { text: string; dir: 'up' | 'down' };
  spark?: number[];
}) {
  return (
    <Card padded={false} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px' }}>
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--klant-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div
          style={{
            fontFamily: 'var(--klant-font-display)',
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: 'var(--klant-ink)',
            fontFeatureSettings: '"tnum"',
            lineHeight: 1.05,
          }}
        >
          {value}
        </div>
        {delta && (
          <span
            style={{
              fontFamily: 'var(--klant-font-mono)',
              fontSize: 11,
              color: delta.dir === 'up' ? 'var(--klant-success)' : 'var(--klant-muted)',
            }}
          >
            {delta.dir === 'up' ? '↑' : '↓'} {delta.text}
          </span>
        )}
      </div>
      {spark ? (
        <div style={{ color: 'var(--klant-accent)', marginTop: 2 }}>
          <Sparkline data={spark} width={160} height={28} color="currentColor" fill="var(--klant-accent-soft)" />
        </div>
      ) : (
        sub && <div style={{ fontSize: 11.5, color: 'var(--klant-dim)' }}>{sub}</div>
      )}
    </Card>
  );
}
