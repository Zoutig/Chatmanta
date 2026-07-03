// V1 Admin — Bot prestaties. Port van app/admindashboard/bot-prestaties/page.tsx.
//
// V1-aanpassingen t.o.v. V0:
//  - Data via lib/v1/admin/bot-performance (getJorionAdminClient, `feedback`-tabel,
//    geen bot_version-filter).
//  - Org-identificatie door UUID (?org=<uuid>), niet slug.
//  - Geen "versie"-regel in de header (V1 heeft geen LATEST_BOT_VERSION-constante).
//  - Disclaimer-links verwijzen naar /v1/admin/usage en /v1/admin/maandelijkse-recap.
//  - Auth: layout requireJorionAdmin gate't de hele route-group; getJorionAdminClient()
//    gooit AUTH_FORBIDDEN door — hier opgevangen voor een nette weergave.
//
// PROXIES, geen accuraatheid: live verkeer heeft geen ground-truth labels.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { isAppError } from '@/lib/errors/app-error';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill } from '@/app/klantendashboard/components/ui/pill';
import { MetricCard } from '@/app/admindashboard/components/metric-card';
import { DailyLineChart } from '@/app/admindashboard/components/daily-line-chart';
import { ReloadButton } from '@/app/admindashboard/components/reload-button';
import { formatRelativeNL } from '@/lib/controlroom/format';
import {
  getBotPerfDetail,
  getBotPerfOverview,
  isPerfWindow,
  LOW_VOLUME_THRESHOLD,
  WINDOW_LABEL,
  type BotPerfDetail,
  type BotPerfOverview,
  type BotPerfStats,
  type OrgBotPerf,
  type PerfWindow,
  type RecentNegative,
} from '@/lib/v1/admin/bot-performance';

export const dynamic = 'force-dynamic';

type SP = { org?: string; window?: string };

// ───────────────────────── formatters ─────────────────────────

const fmtPct = (n: number | null) => (n == null ? '—' : `${n}%`);
const fmtMs = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('nl-NL')} ms`);

function hrefFor(orgId: string | null, window: PerfWindow): string {
  const sp = new URLSearchParams();
  if (orgId) sp.set('org', orgId);
  sp.set('window', window);
  return `/v1/admin/bot-prestaties?${sp.toString()}`;
}

// ───────────────────────── small UI helpers ─────────────────────────

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 11, color: 'var(--klant-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--klant-ink)', marginTop: 2 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11.5, color: 'var(--klant-muted)', marginTop: 1 }}>{sub}</div> : null}
    </div>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="klant-section-title">{children}</div>
      {hint ? <div style={{ fontSize: 12, color: 'var(--klant-dim)', marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function StatRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, rowGap: 14 }}>{children}</div>;
}

function WindowToggle({ window, orgId }: { window: PerfWindow; orgId: string | null }) {
  const opts: PerfWindow[] = ['30d', 'month'];
  return (
    <div style={{ display: 'inline-flex', gap: 6 }}>
      {opts.map((w) => (
        <Link key={w} href={hrefFor(orgId, w)} style={{ textDecoration: 'none' }}>
          <Pill tone={w === window ? 'accent' : 'neutral'}>{WINDOW_LABEL[w]}</Pill>
        </Link>
      ))}
    </div>
  );
}

function Disclaimer() {
  return (
    <p className="klant-hint" style={{ marginTop: 2 }}>
      Observationele kwaliteit uit <strong>live verkeer</strong> (proxies + duim-feedback) —{' '}
      <strong>geen accuraatheidsmeting</strong>, want live verkeer heeft geen ground-truth. De
      in-dashboard test-tool telt niet mee; alleen echte bezoekers. Voor kosten/volume zie{' '}
      <Link href="/v1/admin/usage" style={{ color: 'var(--klant-accent)' }}>Usage &amp; Kosten</Link>, voor
      het maand-narratief de{' '}
      <Link href="/v1/admin/maandelijkse-recap" style={{ color: 'var(--klant-accent)' }}>Maandelijkse Recap</Link>.
    </p>
  );
}

// ───────────────────────── metric blocks ─────────────────────────

function VolumeNotice({ stats, window }: { stats: BotPerfStats; window: PerfWindow }) {
  if (stats.total === 0) {
    return (
      <Card muted style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13.5, color: 'var(--klant-ink)', fontWeight: 600 }}>Nog geen live verkeer</div>
        <p style={{ fontSize: 13, color: 'var(--klant-muted)', margin: '4px 0 0' }}>
          Geen vragen in {WINDOW_LABEL[window]}. Zodra echte bezoekers de widget gebruiken
          verschijnen hier signalen. (De in-dashboard test-tool schrijft geen telemetrie.)
        </p>
      </Card>
    );
  }
  if (stats.lowVolume) {
    return (
      <div style={{ marginBottom: 12 }}>
        <Pill tone="warn">
          Lage volume — {stats.total} vragen (&lt; {LOW_VOLUME_THRESHOLD}) · cijfers indicatief
        </Pill>
      </div>
    );
  }
  return null;
}

function StatsGrid({ stats, window }: { stats: BotPerfStats; window: PerfWindow }) {
  const dimmed = stats.lowVolume;
  return (
    <div className="klant-metrics-grid" style={dimmed ? { opacity: 0.62 } : undefined}>
      <MetricCard label="Vragen (live)" value={stats.total} sub={WINDOW_LABEL[window]} />
      <MetricCard
        label="Weiger-/fallback-ratio"
        value={fmtPct(stats.fallbackPct)}
        sub={`${stats.fallback}/${stats.total} · proxy, geen fout-%`}
      />
      <MetricCard
        label="Grounding-support"
        value={fmtPct(stats.groundedPct)}
        sub={stats.groundedChecked > 0 ? `${stats.groundedTrue}/${stats.groundedChecked} geverifieerd` : 'geen verifier-runs'}
      />
      <MetricCard
        label="👎-ratio (feedback)"
        value={fmtPct(stats.feedback.downPct)}
        sub={`${stats.feedback.up} 👍 · ${stats.feedback.down} 👎`}
      />
      <MetricCard
        label="TTFT p95"
        value={fmtMs(stats.ttftP95)}
        sub={stats.ttftN > 0 ? `p50 ${fmtMs(stats.ttftP50)} · n=${stats.ttftN}${stats.capped ? ' · steekproef' : ''}` : 'geen TTFT-data'}
      />
      <MetricCard
        label="Kennisgaten"
        value={fmtPct(stats.gapAnyPct)}
        sub={`${stats.gapAny} van ${stats.total} vragen`}
      />
    </div>
  );
}

function GapSection({ stats }: { stats: BotPerfStats }) {
  return (
    <Card>
      <SectionTitle hint="Waar de bot tegen de grenzen van zijn kennis liep, plus de routering van vragen.">
        Dekking &amp; kennisgaten
      </SectionTitle>
      <StatRow>
        <Stat label="Zero-hits" value={String(stats.gap.zeroHits)} sub="geen enkele chunk" />
        <Stat label="Lage confidence" value={String(stats.gap.lowConfidence)} />
        <Stat label="Lage grounding" value={String(stats.gap.lowGrounding)} />
        <Stat label="Off-topic" value={String(stats.gap.offTopic)} />
        <Stat label="Geen bron" value={String(stats.zeroSource)} sub={`${fmtPct(stats.zeroSourcePct)} van vragen`} />
      </StatRow>
      <div style={{ height: 1, background: 'var(--klant-border)', margin: '14px 0' }} />
      <StatRow>
        <Stat label="Zoekvragen" value={String(stats.category.search)} />
        <Stat label="Algemene kennis" value={String(stats.category.general)} />
        <Stat label="Off-topic" value={String(stats.category.offTopic)} />
        <Stat label="Smalltalk" value={String(stats.category.smalltalk)} />
      </StatRow>
    </Card>
  );
}

function LatencySection({ stats }: { stats: BotPerfStats }) {
  return (
    <Card>
      <SectionTitle hint={stats.capped ? 'Percentielen over een steekproef (rij-cap geraakt).' : 'Percentielen over alle gemeten antwoorden in het venster.'}>
        Snelheid
      </SectionTitle>
      <StatRow>
        <Stat label="TTFT p50" value={fmtMs(stats.ttftP50)} sub="tijd tot 1e token" />
        <Stat label="TTFT p95" value={fmtMs(stats.ttftP95)} sub={`n=${stats.ttftN}`} />
        <Stat label="Totaal p50" value={fmtMs(stats.totalP50)} />
        <Stat label="Totaal p95" value={fmtMs(stats.totalP95)} sub={`n=${stats.totalN}`} />
        <Stat label="Cache-hit" value={fmtPct(stats.fromCachePct)} sub={`${stats.fromCache} antwoorden`} />
      </StatRow>
    </Card>
  );
}

function FeedbackSection({ stats, negatives }: { stats: BotPerfStats; negatives?: RecentNegative[] }) {
  return (
    <Card>
      <SectionTitle hint="Duim-feedback uit de widget (V1: `feedback`-tabel, versie-agnostisch).">
        Gebruikersfeedback
      </SectionTitle>
      <StatRow>
        <Stat label="👍 Positief" value={String(stats.feedback.up)} />
        <Stat label="👎 Negatief" value={String(stats.feedback.down)} />
        <Stat label="👎-ratio" value={fmtPct(stats.feedback.downPct)} />
      </StatRow>
      {negatives && negatives.length > 0 ? (
        <>
          <div style={{ height: 1, background: 'var(--klant-border)', margin: '14px 0' }} />
          <div style={{ fontSize: 12, color: 'var(--klant-dim)', marginBottom: 8 }}>
            Recente 👎 met toelichting (bezoeker-vrije-tekst):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {negatives.map((nf, i) => (
              <div key={i} style={{ borderLeft: '2px solid var(--klant-danger-border)', paddingLeft: 10 }}>
                <div style={{ fontSize: 13, color: 'var(--klant-ink)' }}>{nf.comment}</div>
                {nf.question ? (
                  <div style={{ fontSize: 12, color: 'var(--klant-muted)', marginTop: 2 }}>
                    bij vraag: &ldquo;{nf.question}&rdquo;
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: 'var(--klant-dim)', marginTop: 2 }}>
                  {formatRelativeNL(nf.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}

function TrendChart({
  daily,
  window,
  hasTraffic,
}: {
  daily: BotPerfOverview['daily'];
  window: PerfWindow;
  hasTraffic: boolean;
}) {
  return (
    <DailyLineChart
      points={daily}
      hasData={hasTraffic}
      title="Weiger-ratio per dag"
      formatValue={(n) => `${n}%`}
      peakPrefix="piek"
      emptyText={`Nog geen verkeer in ${WINDOW_LABEL[window]}.`}
      ariaLabel="Lijngrafiek van de dagelijkse weiger-/fallback-ratio over het venster"
      footnote="Aandeel vragen dat op een fallback uitkwam, per dag. Een knik omhoog ná een deploy is een regressie-signaal — geen fout-%."
    />
  );
}

// ───────────────────────── cross-org tabel ─────────────────────────

function CrossOrgTable({ orgs, window }: { orgs: OrgBotPerf[]; window: PerfWindow }) {
  // Aandacht eerst: hoogste weiger-ratio bovenaan; orgs zonder verkeer onderaan.
  const sorted = [...orgs].sort((a, b) => {
    const av = a.stats.fallbackPct ?? -1;
    const bv = b.stats.fallbackPct ?? -1;
    return bv - av;
  });
  return (
    <Card padded={false}>
      <div style={{ overflowX: 'auto' }} className="table-scroll">
        <table className="klant-table">
          <thead>
            <tr>
              <th>Klant</th>
              <th>Vragen</th>
              <th>Weiger %</th>
              <th>Grounding %</th>
              <th>👎</th>
              <th>TTFT p95</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => (
              <tr key={o.orgId}>
                <td>
                  {/* V1: link via orgId (UUID), niet slug */}
                  <Link
                    href={hrefFor(o.orgId, window)}
                    style={{ textDecoration: 'none', color: 'var(--klant-ink)', fontWeight: 600, fontSize: 13.5 }}
                  >
                    {o.name}
                  </Link>
                </td>
                <td style={{ fontSize: 13 }}>{o.stats.total}</td>
                <td style={{ fontSize: 13 }}>{fmtPct(o.stats.fallbackPct)}</td>
                <td style={{ fontSize: 13 }}>{fmtPct(o.stats.groundedPct)}</td>
                <td style={{ fontSize: 13 }}>{o.stats.feedback.down}</td>
                <td style={{ fontSize: 13 }}>{fmtMs(o.stats.ttftP95)}</td>
                <td>
                  {o.stats.total === 0 ? (
                    <Pill tone="neutral">geen verkeer</Pill>
                  ) : o.stats.lowVolume ? (
                    <Pill tone="warn">lage volume</Pill>
                  ) : (
                    <Pill tone="success" dot>
                      ok
                    </Pill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ───────────────────────── views ─────────────────────────

function OverviewView({ overview }: { overview: BotPerfOverview }) {
  const { aggregate, orgs, daily, window } = overview;
  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Bot prestaties</h1>
          <p className="klant-page-sub">{WINDOW_LABEL[window]} · alle klanten</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <WindowToggle window={window} orgId={null} />
          <ReloadButton />
        </div>
      </header>

      <Disclaimer />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        <VolumeNotice stats={aggregate} window={window} />
        <StatsGrid stats={aggregate} window={window} />
        <TrendChart daily={daily} window={window} hasTraffic={aggregate.total > 0} />
        <GapSection stats={aggregate} />
        <LatencySection stats={aggregate} />
        <FeedbackSection stats={aggregate} />

        <div>
          <SectionTitle hint="Klik een klant voor de drill-down.">Per klant</SectionTitle>
          <CrossOrgTable orgs={orgs} window={window} />
        </div>
      </div>
    </>
  );
}

function DetailView({ detail }: { detail: BotPerfDetail }) {
  const { org, daily, recentNegatives, window } = detail;
  return (
    <>
      <header className="klant-page-header">
        <div>
          <Link
            href={hrefFor(null, window)}
            className="klant-nav-item"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 0', marginBottom: 6, fontSize: 13 }}
          >
            <ArrowLeft size={15} strokeWidth={1.8} />
            Alle klanten
          </Link>
          <h1 className="klant-page-title">{org.name} — bot prestaties</h1>
          <p className="klant-page-sub">{WINDOW_LABEL[window]}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <WindowToggle window={window} orgId={org.orgId} />
          <ReloadButton />
        </div>
      </header>

      <Disclaimer />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        <VolumeNotice stats={org.stats} window={window} />
        <StatsGrid stats={org.stats} window={window} />
        <TrendChart daily={daily} window={window} hasTraffic={org.stats.total > 0} />
        <GapSection stats={org.stats} />
        <LatencySection stats={org.stats} />
        <FeedbackSection stats={org.stats} negatives={recentNegatives} />
      </div>
    </>
  );
}

export default async function BotPrestatiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const window: PerfWindow = isPerfWindow(sp.window) ? sp.window : '30d';

  // org-param is een UUID in V1 (V0 gebruikte slug)
  const orgId = sp.org && sp.org.length > 0 ? sp.org : null;

  try {
    if (orgId) {
      const detail = await getBotPerfDetail(orgId, window);
      if (detail) return <DetailView detail={detail} />;
      // Onbekende/verwijderde org → val terug op het overzicht
    }

    const overview = await getBotPerfOverview(window);
    return <OverviewView overview={overview} />;
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
}
