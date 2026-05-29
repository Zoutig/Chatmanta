// Admin Dashboard — Crawl & Jobs (taak 5). Operationeel cross-org crawl-overzicht
// bovenop getCrawlHealth: rollup-cijfers + verrijkte rijen (categorie-label,
// aanbevolen fix, decision-labels) doorgegeven aan de client-laag voor filteren,
// per-job detail, opnieuw-proberen en het verwerken van openstaande crawls.
//
// Crawl-fouten/fallbacks horen HIER, niet onder Issues (taak 8-scheiding).

import {
  getCrawlHealth,
  CATEGORY_LABEL,
  RECOMMENDED_FIX,
  DECISION_LABEL,
} from '@/lib/v0/server/crawl-health';
import { MetricCard } from '../components/metric-card';
import { ReloadButton } from '../components/reload-button';
import { JobsClient, type JobRow } from './jobs-client';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const health = await getCrawlHealth();

  const rows: JobRow[] = health.recent.map((r) => ({
    jobId: r.jobId,
    orgId: r.orgId,
    orgName: r.orgName,
    host: r.host,
    rootUrl: r.rootUrl,
    jobStatus: r.jobStatus,
    category: r.category,
    categoryLabel: CATEGORY_LABEL[r.category],
    recommendedFix: RECOMMENDED_FIX[r.category],
    completed: r.completed,
    total: r.total,
    pagesOk: r.pagesOk,
    pagesFailed: r.pagesFailed,
    pagesExcluded: r.pagesExcluded,
    durationMs: r.durationMs,
    attempts: r.attempts,
    creditsUsed: r.creditsUsed,
    createdAt: r.createdAt,
    errorMessage: r.errorMessage,
    events: r.events.map((e) => ({
      eventType: e.eventType,
      decision: e.decision,
      decisionLabel: e.decision ? (DECISION_LABEL[e.decision] ?? e.decision) : null,
      firecrawlStatus: e.firecrawlStatus,
      completed: e.completed,
      total: e.total,
      dataCount: e.dataCount,
      creditsUsed: e.creditsUsed,
      message: e.message,
      createdAt: e.createdAt,
    })),
  }));

  const failed = rows.filter((r) => r.jobStatus === 'failed').length;
  const totalCredits = rows.reduce((a, r) => a + (r.creditsUsed ?? 0), 0);

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Crawls &amp; Jobs</h1>
          <p className="klant-page-sub">
            Operationeel inzicht in alle website-crawls: status, fouten + waarom, credits en de
            aanbevolen actie. Failed crawls en fallbacks staan hier (niet onder Issues).
          </p>
        </div>
        <ReloadButton />
      </header>

      <div className="klant-metrics-grid" style={{ marginBottom: 16 }}>
        <MetricCard label="Crawls (recent)" value={health.totalCrawls} sub={`${health.terminalCrawls} afgerond`} />
        <MetricCard
          label="Slagingspercentage"
          value={health.successRate == null ? '—' : `${Math.round(health.successRate * 100)}%`}
          tone={health.successRate != null && health.successRate < 0.8 ? 'warn' : 'ink'}
        />
        <MetricCard label="Gefaald" value={failed} tone={failed > 0 ? 'danger' : 'success'} />
        <MetricCard label="Firecrawl-credits" value={totalCredits} sub="over getoonde crawls" />
      </div>

      <JobsClient rows={rows} />
    </>
  );
}
