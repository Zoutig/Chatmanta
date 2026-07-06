// Admin Dashboard — Bot prestaties. Kwaliteit/prestatie-signalen uit LIVE
// telemetrie (query_log + v0_feedback), als doorlopende "real-life eval".
//
// PROXIES, geen accuraatheid: live verkeer heeft geen ground-truth labels. Deze
// tab toont nooit een correctheid-%. Kosten/volume staan in Usage & Kosten en
// het maand-narratief in Maandelijkse Recap — hier alleen kwaliteit/prestatie.
//
// Cross-org overzicht + per-klant drill-down via dezelfde component, gefilterd
// op ?org=<slug>. Venster (?window=30d|month) en versie-default (LATEST) bepalen
// de scope; geen client-state nodig (RSC + URL-params, force-dynamic).

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill } from '@/app/klantendashboard/components/ui/pill';
import { MetricCard } from '../components/metric-card';
import { DailyLineChart } from '../components/daily-line-chart';
import { ReloadButton } from '../components/reload-button';
import { formatRelativeNL } from '@/lib/controlroom/format';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import {
  getBotPerfDetail,
  getBotPerfOverview,
  isPerfWindow,
  LOW_VOLUME_THRESHOLD,
  WINDOW_LABEL,
  type BotPerfDetail,
  type BotPerfOverview,
  type BotPerfStats,
  type InjectionSummary,
  type OrgBotPerf,
  type PerfWindow,
  type RecentNegative,
  type UngroundedFact,
} from '@/lib/controlroom/server/bot-performance';
import { getEvalVerdicts, type EvalVerdict } from '@/lib/v0/server/evals-snapshot';

export const dynamic = 'force-dynamic';

type SP = { org?: string; window?: string };

// ───────────────────────── formatters ─────────────────────────

const fmtPct = (n: number | null) => (n == null ? '—' : `${n}%`);
const fmtMs = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('nl-NL')} ms`);

function hrefFor(org: string | null, window: PerfWindow): string {
  const sp = new URLSearchParams();
  if (org) sp.set('org', org);
  sp.set('window', window);
  return `/admindashboard/bot-prestaties?${sp.toString()}`;
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

function WindowToggle({ window, org }: { window: PerfWindow; org: string | null }) {
  const opts: PerfWindow[] = ['30d', 'month'];
  return (
    <div style={{ display: 'inline-flex', gap: 6 }}>
      {opts.map((w) => (
        <Link key={w} href={hrefFor(org, w)} style={{ textDecoration: 'none' }}>
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
      <Link href="/admindashboard/usage" style={{ color: 'var(--klant-accent)' }}>Usage &amp; Kosten</Link>, voor
      het maand-narratief de{' '}
      <Link href="/admindashboard/maandelijkse-recap" style={{ color: 'var(--klant-accent)' }}>Maandelijkse Recap</Link>.
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
          Geen vragen op de live versie in {WINDOW_LABEL[window]}. Zodra echte bezoekers de widget
          gebruiken verschijnen hier signalen. (De in-dashboard test-tool schrijft geen telemetrie.)
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
  const dimmed = stats.lowVolume; // ook bij total===0
  return (
    <div className="klant-metrics-grid" style={dimmed ? { opacity: 0.62 } : undefined}>
      <MetricCard label="Vragen (live versie)" value={stats.total} sub={WINDOW_LABEL[window]} />
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
      <SectionTitle hint="Duim-feedback uit de widget (versie-agnostisch — v0_feedback heeft geen botversie).">
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
                    bij vraag: “{nf.question}”
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

// ───────────────────────── WP7: injectie / RAG-internals / grounding / eval ────

function InjectionSection({
  injection,
  perOrg,
}: {
  injection: InjectionSummary;
  perOrg?: OrgBotPerf[];
}) {
  const withAttempts = (perOrg ?? []).filter((o) => o.injection.last30 > 0);
  return (
    <Card>
      <SectionTitle hint="Gedetecteerde prompt-injectie-pogingen (regex-heuristiek, log-only, versie-agnostisch). Getoond zijn patroon-namen — nooit de ruwe vraagtekst.">
        Misbruikpogingen (prompt-injectie)
      </SectionTitle>
      {injection.last30 === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--klant-muted)', margin: 0 }}>
          Geen injectie-pogingen gedetecteerd in de laatste 30 dagen.
        </p>
      ) : (
        <>
          <StatRow>
            <Stat label="Laatste 7 dagen" value={String(injection.last7)} sub="pogingen" />
            <Stat label="Laatste 30 dagen" value={String(injection.last30)} sub="pogingen" />
          </StatRow>
          {injection.patterns.length > 0 ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--klant-dim)', margin: '14px 0 8px' }}>
                Meest voorkomende patronen (30d):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {injection.patterns.map((p) => (
                  <Pill key={p.name} tone="warn">
                    {/* plain text — patroon-naam uit INJECTION_PATTERNS, geen markdown */}
                    {p.name} · {p.count}
                  </Pill>
                ))}
              </div>
            </>
          ) : null}
          {withAttempts.length > 0 ? (
            <>
              <div style={{ height: 1, background: 'var(--klant-border)', margin: '14px 0' }} />
              <div style={{ fontSize: 12, color: 'var(--klant-dim)', marginBottom: 8 }}>
                Per klant (30d):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {withAttempts
                  .sort((a, b) => b.injection.last30 - a.injection.last30)
                  .map((o) => (
                    <div
                      key={o.slug}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 12 }}
                    >
                      <span style={{ color: 'var(--klant-ink)' }}>{o.name}</span>
                      <span style={{ color: 'var(--klant-muted)' }}>
                        {o.injection.last7} (7d) · {o.injection.last30} (30d)
                      </span>
                    </div>
                  ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </Card>
  );
}

function RagInternalsSection({ stats }: { stats: BotPerfStats }) {
  const { rag } = stats;
  return (
    <Card>
      <SectionTitle hint="Interne RAG-signalen uit de telemetrie — dev-gericht. Per-fase p50 (median) over gemeten antwoorden in het venster.">
        RAG-internals
      </SectionTitle>
      <StatRow>
        <Stat label="Embedding p50" value={fmtMs(rag.embeddingP50)} />
        <Stat label="Retrieval p50" value={fmtMs(rag.retrievalP50)} />
        <Stat label="Rerank p50" value={fmtMs(rag.rerankP50)} />
        <Stat label="Generatie p50" value={fmtMs(rag.generationP50)} />
      </StatRow>
      <div style={{ height: 1, background: 'var(--klant-border)', margin: '14px 0' }} />
      <StatRow>
        <Stat
          label="Algemene kennis gebruikt"
          value={rag.gkChecked > 0 ? String(rag.gkActual) : '—'}
          sub={rag.gkChecked > 0 ? `van ${rag.gkChecked} antwoorden` : 'geen data'}
        />
        <Stat
          label="Claim-confidence (gem.)"
          value={rag.claimConfAvg == null ? '—' : rag.claimConfAvg.toFixed(2)}
          sub={rag.claimConfN > 0 ? `n=${rag.claimConfN} verifier-runs` : 'geen verifier-runs'}
        />
      </StatRow>
    </Card>
  );
}

function UngroundedFactsSection({ facts }: { facts: UngroundedFact[] }) {
  if (facts.length === 0) return null;
  return (
    <Card>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--klant-ink)' }}>
          Ongefundeerde feiten — recentste {facts.length} (grounding-drilldown)
        </summary>
        <p style={{ fontSize: 12, color: 'var(--klant-dim)', margin: '6px 0 10px' }}>
          Antwoorden waar de verifier harde feiten (bedragen/datums/aantallen/contact) niet in de
          bronnen kon terugvinden. De feiten zijn categorie-prefixed; de vraag is PII-geredacteerd.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {facts.map((f, i) => (
            <div key={i} style={{ borderLeft: '2px solid var(--klant-warn-border)', paddingLeft: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--klant-ink)' }}>
                {f.facts.length > 0 ? f.facts.join(', ') : '(geen feit-labels geregistreerd)'}
              </div>
              {f.question ? (
                <div style={{ fontSize: 12, color: 'var(--klant-muted)', marginTop: 2 }}>
                  bij vraag: “{f.question}”
                </div>
              ) : null}
              <div style={{ fontSize: 11, color: 'var(--klant-dim)', marginTop: 2 }}>
                {formatRelativeNL(f.createdAt)}
              </div>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}

// V0-only: offline eval-uitslagen (eval_runs, DEV_ORG_ID). Niet per klant —
// synthetische gold-set. Pass-rate = prod-ready true-rate uit de judge.
function EvalVerdictSection({ verdicts }: { verdicts: EvalVerdict[] }) {
  if (verdicts.length === 0) return null;
  return (
    <Card padded={false}>
      <div style={{ padding: 'var(--klant-pad-y) var(--klant-pad-x) 0' }}>
        <SectionTitle hint="Laatste offline eval per botversie (LLM-judge over de synthetische gold-set). Pass-rate = aandeel prod-ready volgens de judge — geen live verkeer.">
          Eval-verdict per botversie
        </SectionTitle>
      </div>
      <div style={{ overflowX: 'auto' }} className="table-scroll">
        <table className="klant-table">
          <thead>
            <tr>
              <th>Versie</th>
              <th>Laatste eval</th>
              <th>Vragen</th>
              <th>Pass-rate</th>
              <th>Gem. score</th>
            </tr>
          </thead>
          <tbody>
            {verdicts.map((v) => (
              <tr key={v.botVersion}>
                <td style={{ fontWeight: 600, fontSize: 13.5 }}>{v.botVersion}</td>
                <td style={{ fontSize: 13 }}>{formatRelativeNL(v.latestRunAt)}</td>
                <td style={{ fontSize: 13 }}>{v.questions}</td>
                <td style={{ fontSize: 13 }}>
                  {v.passRate == null ? '—' : `${v.passRate}%`}
                  {v.passRate != null ? (
                    <span style={{ color: 'var(--klant-dim)', fontSize: 11.5 }}> · n={v.prodReadyN}</span>
                  ) : null}
                </td>
                <td style={{ fontSize: 13 }}>{v.avgScore == null ? '—' : `${v.avgScore}/5`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

// ───────────────────────── cross-org table ─────────────────────────

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
              <tr key={o.slug}>
                <td>
                  <Link
                    href={hrefFor(o.slug, window)}
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

function VersionLine({ version, window }: { version: string; window: PerfWindow }) {
  return (
    <p className="klant-page-sub">
      Cijfers voor de nu-live versie <strong>{version}</strong> · {WINDOW_LABEL[window]}.
    </p>
  );
}

function OverviewView({
  overview,
  evalVerdicts,
}: {
  overview: BotPerfOverview;
  evalVerdicts: EvalVerdict[];
}) {
  const { aggregate, orgs, daily, version, window, injectionAgg } = overview;
  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Bot prestaties</h1>
          <VersionLine version={version} window={window} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <WindowToggle window={window} org={null} />
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
        <RagInternalsSection stats={aggregate} />
        <InjectionSection injection={injectionAgg} perOrg={orgs} />
        <EvalVerdictSection verdicts={evalVerdicts} />
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
  const { org, daily, recentNegatives, ungroundedFacts, version, window } = detail;
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
          <VersionLine version={version} window={window} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <WindowToggle window={window} org={org.slug} />
          <ReloadButton />
        </div>
      </header>

      <Disclaimer />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        <VolumeNotice stats={org.stats} window={window} />
        <StatsGrid stats={org.stats} window={window} />
        <UngroundedFactsSection facts={ungroundedFacts} />
        <TrendChart daily={daily} window={window} hasTraffic={org.stats.total > 0} />
        <GapSection stats={org.stats} />
        <LatencySection stats={org.stats} />
        <RagInternalsSection stats={org.stats} />
        <InjectionSection injection={org.injection} />
        <FeedbackSection stats={org.stats} negatives={recentNegatives} />
      </div>
    </>
  );
}

export default async function BotPrestatiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const window: PerfWindow = isPerfWindow(sp.window) ? sp.window : '30d';
  const orgSlug: OrgSlug | null = sp.org && sp.org in KNOWN_ORGS ? (sp.org as OrgSlug) : null;

  if (orgSlug) {
    const detail = await getBotPerfDetail(orgSlug, window);
    if (detail) return <DetailView detail={detail} />;
  }

  // Eval-tegel is best-effort: een eval_runs-fout mag de live-telemetrie niet breken.
  const [overview, evalVerdicts] = await Promise.all([
    getBotPerfOverview(window),
    getEvalVerdicts().catch(() => [] as EvalVerdict[]),
  ]);
  return <OverviewView overview={overview} evalVerdicts={evalVerdicts} />;
}
