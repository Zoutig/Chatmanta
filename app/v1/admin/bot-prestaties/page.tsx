// V1 Admin — Botprestaties.
//
//  - Data via lib/v1/admin/bot-performance (getJorionAdminClient, `feedback`-tabel,
//    geen bot_version-filter).
//  - Org-identificatie door UUID (?org=<uuid>), niet slug.
//  - Auth: layout requireJorionAdmin gate't de hele route-group; getJorionAdminClient()
//    gooit AUTH_FORBIDDEN door, hier opgevangen voor een nette weergave.
//
// PROXIES, geen accuraatheid: live verkeer heeft geen ground-truth labels.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { isAppError } from '@/lib/errors/app-error';
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
  type InjectionSummary,
  type OrgBotPerf,
  type PerfWindow,
  type RecentNegative,
  type UngroundedFact,
} from '@/lib/v1/admin/bot-performance';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Badge, InfoTip } from '@/app/v1/_ui/feedback';
import { Metric, MetricGrid } from '../_ui/metric';
import { LineChart } from '../_ui/line-chart';
import { ReloadButton } from '../_ui/reload-button';
import { DataTable, NumCell } from '../_ui/data-table';
import { FilterChip } from '../_ui/filter-chips';

export const dynamic = 'force-dynamic';

type SP = { org?: string; window?: string };

// ───────────────────────── opmaak ─────────────────────────

const fmtPct = (n: number | null) => (n == null ? 'Geen data' : `${n}%`);
const fmtMs = (n: number | null) => (n == null ? 'Geen data' : `${n.toLocaleString('nl-NL')} ms`);

function hrefFor(orgId: string | null, window: PerfWindow): string {
  const sp = new URLSearchParams();
  if (orgId) sp.set('org', orgId);
  sp.set('window', window);
  return `/v1/admin/bot-prestaties?${sp.toString()}`;
}

// ───────────────────────── kleine bouwstenen ─────────────────────────

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="v1-adm-stat">
      <span className="v1-adm-stat-label">{label}</span>
      <span className="v1-adm-stat-value">{value}</span>
      {sub ? <span className="v1-adm-stat-sub">{sub}</span> : null}
    </div>
  );
}

function SectionCard({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  return (
    <section className="v1-card">
      <h2 className="v1-section-title v1-adm-title-row">
        {title}
        {info ? <InfoTip text={info} /> : null}
      </h2>
      {children}
    </section>
  );
}

function StatRow({ children }: { children: ReactNode }) {
  return <div className="v1-adm-stat-row">{children}</div>;
}

function Divider() {
  return <hr className="v1-adm-divider" />;
}

function WindowToggle({ window, orgId }: { window: PerfWindow; orgId: string | null }) {
  const opts: PerfWindow[] = ['30d', 'month'];
  return (
    <div className="v1-adm-filter-chips" role="group" aria-label="Periode">
      {opts.map((w) => (
        <FilterChip key={w} href={hrefFor(orgId, w)} active={w === window}>
          {WINDOW_LABEL[w]}
        </FilterChip>
      ))}
    </div>
  );
}

const DISCLAIMER =
  'Signalen uit live verkeer (benaderingen en duimfeedback), geen meting van juistheid: live verkeer heeft geen vaste antwoorden om tegen te toetsen. De testchat in het dashboard telt niet mee, alleen echte bezoekers.';

function Disclaimer() {
  return (
    <p className="v1-adm-muted v1-adm-note">
      Signalen uit live verkeer, geen meting van juistheid. <InfoTip text={DISCLAIMER} /> Kosten en volume staan bij{' '}
      <Link href="/v1/admin/usage" className="v1-section-link">
        Gebruik en kosten
      </Link>
      , het maandverhaal bij de{' '}
      <Link href="/v1/admin/maandelijkse-recap" className="v1-section-link">
        Maandrecap
      </Link>
      .
    </p>
  );
}

// ───────────────────────── blokken ─────────────────────────

function VolumeNotice({ stats, window }: { stats: BotPerfStats; window: PerfWindow }) {
  if (stats.total === 0) {
    return (
      <section className="v1-card v1-adm-muted-card">
        <p className="v1-adm-strong">Nog geen live verkeer</p>
        <p className="v1-adm-muted">
          Geen vragen in {WINDOW_LABEL[window].toLowerCase()}. Zodra echte bezoekers de widget gebruiken, verschijnen hier signalen.
        </p>
      </section>
    );
  }
  if (stats.lowVolume) {
    return (
      <div>
        <Badge tone="warn">
          Laag volume: {stats.total} vragen (minder dan {LOW_VOLUME_THRESHOLD}), cijfers zijn een indicatie
        </Badge>
      </div>
    );
  }
  return null;
}

function StatsGrid({ stats, window }: { stats: BotPerfStats; window: PerfWindow }) {
  return (
    <div style={stats.lowVolume ? { opacity: 0.62 } : undefined}>
      <MetricGrid>
        <Metric label="Vragen (live)" value={stats.total} sub={WINDOW_LABEL[window]} />
        <Metric
          label="Weiger- en fallbackratio"
          value={fmtPct(stats.fallbackPct)}
          sub={`${stats.fallback} van ${stats.total}, benadering, geen foutpercentage`}
        />
        <Metric
          label="Onderbouwd door bronnen"
          value={fmtPct(stats.groundedPct)}
          sub={stats.groundedChecked > 0 ? `${stats.groundedTrue} van ${stats.groundedChecked} gecontroleerd` : 'Nog niet gecontroleerd'}
        />
        <Metric
          label="Negatieve feedback"
          value={fmtPct(stats.feedback.downPct)}
          sub={`${stats.feedback.up} positief, ${stats.feedback.down} negatief`}
        />
        <Metric
          label="Eerste woord (p95)"
          value={fmtMs(stats.ttftP95)}
          sub={
            stats.ttftN > 0
              ? `Mediaan ${fmtMs(stats.ttftP50)}, n=${stats.ttftN}${stats.capped ? ', steekproef' : ''}`
              : 'Nog geen metingen'
          }
        />
        <Metric label="Kennisgaten" value={fmtPct(stats.gapAnyPct)} sub={`${stats.gapAny} van ${stats.total} vragen`} />
      </MetricGrid>
    </div>
  );
}

function GapSection({ stats }: { stats: BotPerfStats }) {
  return (
    <SectionCard title="Dekking en kennisgaten" info="Waar de bot tegen de grenzen van zijn kennis liep, plus hoe vragen gerouteerd werden.">
      <StatRow>
        <Stat label="Niets gevonden" value={String(stats.gap.zeroHits)} sub="Geen enkel tekstblok" />
        <Stat label="Lage zekerheid" value={String(stats.gap.lowConfidence)} />
        <Stat label="Zwak onderbouwd" value={String(stats.gap.lowGrounding)} />
        <Stat label="Buiten onderwerp" value={String(stats.gap.offTopic)} />
        <Stat label="Geen bron" value={String(stats.zeroSource)} sub={`${fmtPct(stats.zeroSourcePct)} van de vragen`} />
      </StatRow>
      <Divider />
      <StatRow>
        <Stat label="Zoekvragen" value={String(stats.category.search)} />
        <Stat label="Algemene kennis" value={String(stats.category.general)} />
        <Stat label="Buiten onderwerp" value={String(stats.category.offTopic)} />
        <Stat label="Praatjes" value={String(stats.category.smalltalk)} />
      </StatRow>
    </SectionCard>
  );
}

function LatencySection({ stats }: { stats: BotPerfStats }) {
  return (
    <SectionCard
      title="Snelheid"
      info={stats.capped ? 'Percentielen over een steekproef (de rijlimiet is geraakt).' : 'Percentielen over alle gemeten antwoorden in de periode.'}
    >
      <StatRow>
        <Stat label="Eerste woord, mediaan" value={fmtMs(stats.ttftP50)} />
        <Stat label="Eerste woord, p95" value={fmtMs(stats.ttftP95)} sub={`n=${stats.ttftN}`} />
        <Stat label="Totaal, mediaan" value={fmtMs(stats.totalP50)} />
        <Stat label="Totaal, p95" value={fmtMs(stats.totalP95)} sub={`n=${stats.totalN}`} />
        <Stat label="Uit de cache" value={fmtPct(stats.fromCachePct)} sub={`${stats.fromCache} antwoorden`} />
      </StatRow>
    </SectionCard>
  );
}

function FeedbackSection({ stats, negatives }: { stats: BotPerfStats; negatives?: RecentNegative[] }) {
  return (
    <SectionCard title="Feedback van bezoekers" info="Duimfeedback uit de widget (tabel feedback, voor alle botversies).">
      <StatRow>
        <Stat label="Positief" value={String(stats.feedback.up)} />
        <Stat label="Negatief" value={String(stats.feedback.down)} />
        <Stat label="Aandeel negatief" value={fmtPct(stats.feedback.downPct)} />
      </StatRow>
      {negatives && negatives.length > 0 ? (
        <>
          <Divider />
          <p className="v1-adm-muted">Recente negatieve feedback met toelichting van de bezoeker:</p>
          <ul className="v1-list">
            {negatives.map((nf, i) => (
              <li key={i} className="v1-list-row">
                <span className="v1-list-main">
                  <span className="v1-list-title v1-list-title--wrap">{nf.comment}</span>
                  {nf.question ? <span className="v1-list-meta">Bij de vraag: &ldquo;{nf.question}&rdquo;</span> : null}
                </span>
                <span className="v1-list-end v1-adm-muted">{formatRelativeNL(nf.createdAt)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </SectionCard>
  );
}

function InjectionSection({ injection, perOrg }: { injection: InjectionSummary; perOrg?: OrgBotPerf[] }) {
  const withAttempts = (perOrg ?? []).filter((o) => o.injection.last30 > 0);
  return (
    <SectionCard
      title="Misbruikpogingen (prompt-injectie)"
      info="Herkende pogingen om de bot instructies te geven (patroonherkenning, alleen gelogd). Je ziet alleen patroonnamen, nooit de vraag zelf."
    >
      {injection.last30 === 0 ? (
        <p className="v1-adm-muted">Geen pogingen gezien in de laatste 30 dagen.</p>
      ) : (
        <>
          <StatRow>
            <Stat label="Laatste 7 dagen" value={String(injection.last7)} sub="pogingen" />
            <Stat label="Laatste 30 dagen" value={String(injection.last30)} sub="pogingen" />
          </StatRow>
          {injection.patterns.length > 0 ? (
            <>
              <p className="v1-adm-muted v1-adm-note">Meest voorkomende patronen (30 dagen):</p>
              <div className="v1-adm-filter-chips">
                {injection.patterns.map((p) => (
                  <Badge key={p.name} tone="warn">
                    {/* platte tekst: patroonnaam uit INJECTION_PATTERNS */}
                    {p.name}: {p.count}
                  </Badge>
                ))}
              </div>
            </>
          ) : null}
          {withAttempts.length > 0 ? (
            <>
              <Divider />
              <p className="v1-adm-muted">Per klant (30 dagen):</p>
              <ul className="v1-list">
                {withAttempts
                  .sort((a, b) => b.injection.last30 - a.injection.last30)
                  .map((o) => (
                    <li key={o.orgId} className="v1-list-row">
                      <span className="v1-list-main">
                        <span className="v1-list-title">{o.name}</span>
                      </span>
                      <span className="v1-list-end v1-adm-muted">
                        {o.injection.last7} in 7 dagen, {o.injection.last30} in 30 dagen
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

function RagInternalsSection({ stats }: { stats: BotPerfStats }) {
  const { rag } = stats;
  return (
    <SectionCard
      title="Binnenkant van de bot"
      info="Interne signalen uit de telemetrie, vooral voor ontwikkeling. Per fase de mediaan over de gemeten antwoorden in de periode."
    >
      <StatRow>
        <Stat label="Embedding, mediaan" value={fmtMs(rag.embeddingP50)} />
        <Stat label="Zoeken, mediaan" value={fmtMs(rag.retrievalP50)} />
        <Stat label="Herordenen, mediaan" value={fmtMs(rag.rerankP50)} />
        <Stat label="Antwoord maken, mediaan" value={fmtMs(rag.generationP50)} />
      </StatRow>
      <Divider />
      <StatRow>
        <Stat
          label="Algemene kennis gebruikt"
          value={rag.gkChecked > 0 ? String(rag.gkActual) : 'Geen data'}
          sub={rag.gkChecked > 0 ? `van ${rag.gkChecked} antwoorden` : undefined}
        />
        <Stat
          label="Zekerheid van beweringen (gem.)"
          value={rag.claimConfAvg == null ? 'Geen data' : rag.claimConfAvg.toLocaleString('nl-NL', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
          sub={rag.claimConfN > 0 ? `n=${rag.claimConfN} controles` : undefined}
        />
      </StatRow>
    </SectionCard>
  );
}

function UngroundedFactsSection({ facts }: { facts: UngroundedFact[] }) {
  if (facts.length === 0) return null;
  return (
    <section className="v1-card">
      <details className="v1-details">
        <summary>
          Niet-onderbouwde feiten: de laatste {facts.length}
          <InfoTip text="Antwoorden waarin de controle harde feiten (bedragen, datums, aantallen, contactgegevens) niet in de bronnen terugvond. De vraag is ontdaan van persoonsgegevens." />
        </summary>
        <ul className="v1-list v1-details-body">
          {facts.map((f, i) => (
            <li key={i} className="v1-list-row">
              <span className="v1-list-main">
                <span className="v1-list-title v1-list-title--wrap">
                  {f.facts.length > 0 ? f.facts.join(', ') : 'Geen feitlabels geregistreerd'}
                </span>
                {f.question ? <span className="v1-list-meta">Bij de vraag: &ldquo;{f.question}&rdquo;</span> : null}
              </span>
              <span className="v1-list-end v1-adm-muted">{formatRelativeNL(f.createdAt)}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function TrendChart({ daily, window, hasTraffic }: { daily: BotPerfOverview['daily']; window: PerfWindow; hasTraffic: boolean }) {
  return (
    <LineChart
      points={daily}
      hasData={hasTraffic}
      title="Weigerratio per dag"
      formatValue={(n) => `${n}%`}
      peakPrefix="piek"
      gradientId="v1-adm-perf-trend"
      emptyText={`Nog geen verkeer in ${WINDOW_LABEL[window].toLowerCase()}.`}
      ariaLabel="Lijngrafiek van de dagelijkse weiger- en fallbackratio over de periode"
      footnote="Aandeel vragen dat op een fallback uitkwam. Een stijging na een release kan op een regressie wijzen."
    />
  );
}

// ───────────────────────── tabel per klant ─────────────────────────

function CrossOrgTable({ orgs, window }: { orgs: OrgBotPerf[]; window: PerfWindow }) {
  // Aandacht eerst: hoogste weigerratio bovenaan; klanten zonder verkeer onderaan.
  const sorted = [...orgs].sort((a, b) => (b.stats.fallbackPct ?? -1) - (a.stats.fallbackPct ?? -1));
  return (
    <section className="v1-card">
      <h2 className="v1-section-title v1-adm-title-row">
        Per klant
        <InfoTip text="Klik een klant voor de details." />
      </h2>
      <DataTable
        label="Botprestaties per klant"
        columns={[
          { label: 'Klant' },
          { label: 'Vragen', num: true },
          { label: 'Weigerratio', num: true },
          { label: 'Onderbouwd', num: true },
          { label: 'Negatief', num: true },
          { label: 'Eerste woord (p95)', num: true },
          { label: 'Status' },
        ]}
      >
        {sorted.map((o) => (
          <tr key={o.orgId}>
            <td>
              <Link href={hrefFor(o.orgId, window)} className="v1-adm-clip">
                {o.name}
              </Link>
            </td>
            <NumCell>{o.stats.total}</NumCell>
            <NumCell>{fmtPct(o.stats.fallbackPct)}</NumCell>
            <NumCell>{fmtPct(o.stats.groundedPct)}</NumCell>
            <NumCell>{o.stats.feedback.down}</NumCell>
            <NumCell>{fmtMs(o.stats.ttftP95)}</NumCell>
            <td>
              {o.stats.total === 0 ? (
                <Badge>Geen verkeer</Badge>
              ) : o.stats.lowVolume ? (
                <Badge tone="warn">Laag volume</Badge>
              ) : (
                <Badge tone="ok" dot>
                  Genoeg data
                </Badge>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}

// ───────────────────────── weergaven ─────────────────────────

function OverviewView({ overview }: { overview: BotPerfOverview }) {
  const { aggregate, orgs, daily, window, injectionAgg } = overview;
  return (
    <div className="v1-page">
      <PageHeader
        title="Botprestaties"
        description={`${WINDOW_LABEL[window]}, alle klanten.`}
        actions={
          <>
            <WindowToggle window={window} orgId={null} />
            <ReloadButton />
          </>
        }
      />
      <Disclaimer />
      <VolumeNotice stats={aggregate} window={window} />
      <StatsGrid stats={aggregate} window={window} />
      <TrendChart daily={daily} window={window} hasTraffic={aggregate.total > 0} />
      <GapSection stats={aggregate} />
      <LatencySection stats={aggregate} />
      <RagInternalsSection stats={aggregate} />
      <InjectionSection injection={injectionAgg} perOrg={orgs} />
      <FeedbackSection stats={aggregate} />
      <CrossOrgTable orgs={orgs} window={window} />
    </div>
  );
}

function DetailView({ detail }: { detail: BotPerfDetail }) {
  const { org, daily, recentNegatives, ungroundedFacts, window } = detail;
  return (
    <div className="v1-page">
      <Link href={hrefFor(null, window)} className="v1-section-link">
        Terug naar alle klanten
      </Link>
      <PageHeader
        title={`Botprestaties: ${org.name}`}
        description={`${WINDOW_LABEL[window]}.`}
        actions={
          <>
            <WindowToggle window={window} orgId={org.orgId} />
            <ReloadButton />
          </>
        }
      />
      <Disclaimer />
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
  );
}

export default async function BotPrestatiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const window: PerfWindow = isPerfWindow(sp.window) ? sp.window : '30d';

  // org-param is een UUID in V1
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
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e;
  }
}
