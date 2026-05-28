// Command Center — Crawl-health (operator-overzicht).
//
// Eén blik over alle recente website-crawls heen: hoeveel slaagden/faalden en
// waarom, per org. Server-rendered (geen client-JS); de drill-in gebruikt native
// <details>. Data uit lib/v0/server/crawl-health.ts (cross-org, read-only).

import {
  getCrawlHealth,
  CATEGORY_LABEL,
  DECISION_LABEL,
  type CrawlHealthCategory,
  type CrawlHealthEvent,
  type CrawlHealthRow,
} from '@/lib/v0/server/crawl-health';

export const dynamic = 'force-dynamic';

/** Tint per categorie: groen = ok, blauw = bezig, amber = vertraagd, rood = fout. */
const TONE: Record<CrawlHealthCategory, string> = {
  success: '#15803d',
  running: '#2563eb',
  'rate-limited': '#b45309',
  timeout: '#b91c1c',
  'firecrawl-failed': '#b91c1c',
  'start-failed': '#b91c1c',
  'no-crawl-id': '#b91c1c',
  exception: '#b91c1c',
  failed: '#b91c1c',
};

function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function Badge({ category }: { category: CrawlHealthCategory }) {
  const tone = TONE[category];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: tone,
        background: `color-mix(in oklab, ${tone} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${tone} 30%, transparent)`,
        borderRadius: 999,
        padding: '2px 9px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: tone }} />
      {CATEGORY_LABEL[category]}
    </span>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '12px 14px',
};

const th: React.CSSProperties = { padding: '4px 8px', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '4px 8px', verticalAlign: 'top' };

function EventTable({ events }: { events: CrawlHealthEvent[] }) {
  return (
    <div style={{ marginTop: 8, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11.5 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--fg-muted)' }}>
            <th style={th}>Tijd</th>
            <th style={th}>Stap</th>
            <th style={th}>Firecrawl</th>
            <th style={th}>Voortgang</th>
            <th style={th}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={td}>{fmtTime(e.createdAt)}</td>
              <td style={td}>{e.decision ? DECISION_LABEL[e.decision] ?? e.decision : e.eventType}</td>
              <td style={td}>{e.firecrawlStatus ?? '—'}</td>
              <td style={td}>
                {e.total != null ? `${e.completed ?? 0}/${e.total}` : '—'}
                {e.dataCount != null ? ` · ${e.dataCount} ontv.` : ''}
                {e.hasNext ? ' · meer' : ''}
              </td>
              <td style={td}>{e.message ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CrawlRow({ row }: { row: CrawlHealthRow }) {
  const label = row.host ?? row.rootUrl ?? '(onbekende site)';
  return (
    <details style={cardStyle}>
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Badge category={row.category} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>{label}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{row.orgName}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--fg-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>
              {row.pagesOk} ok · {row.pagesFailed} fout · {row.pagesExcluded} leeg/uit
            </span>
            {row.total > 0 && <span>Firecrawl {row.completed}/{row.total}</span>}
            <span>Duur {fmtDuration(row.durationMs)}</span>
            <span>{fmtTime(row.createdAt)}</span>
          </div>
          {row.errorMessage && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: TONE[row.category] }}>{row.errorMessage}</div>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
          {row.events.length > 0 ? 'Details ▾' : ''}
        </span>
      </summary>
      {row.events.length > 0 && <EventTable events={row.events} />}
    </details>
  );
}

export default async function CrawlHealthPage() {
  const health = await getCrawlHealth();

  return (
    <div>
      {/* Kop */}
      <div style={{ marginBottom: 22 }}>
        <h1
          style={{
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--fg)',
            margin: 0,
          }}
        >
          Crawl-health
        </h1>
        <p style={{ marginTop: 8, fontSize: 13.5, color: 'var(--fg-muted)', maxWidth: 640 }}>
          De laatste {health.totalCrawls} website-crawls over alle demo-orgs. Klap een crawl open voor de
          technische tijdlijn.
        </p>
      </div>

      {health.totalCrawls === 0 ? (
        <div style={{ ...cardStyle, color: 'var(--fg-muted)', fontSize: 13.5 }}>
          Nog geen crawls uitgevoerd. Start er een via het Klantendashboard → Kennisbank → Website.
        </div>
      ) : (
        <>
          {/* Rollup */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 10,
              marginBottom: 22,
            }}
          >
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Slaagpercentage</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>
                {health.successRate == null ? '—' : `${Math.round(health.successRate * 100)}%`}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                over {health.terminalCrawls} afgeronde
              </span>
            </div>
            {health.rollup.map((item) => (
              <div key={item.category} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: TONE[item.category] }} />
                  {item.label}
                </span>
                <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>{item.count}</span>
              </div>
            ))}
          </div>

          {/* Recente crawls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {health.recent.map((row) => (
              <CrawlRow key={row.jobId} row={row} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
