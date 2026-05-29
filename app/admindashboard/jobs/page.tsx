// Admin Dashboard — Crawl & Jobs (taak 5). Operationeel cross-org crawl-overzicht
// bovenop getCrawlHealth: rollup-cijfers + verrijkte rijen (categorie-label,
// aanbevolen fix, decision-labels) doorgegeven aan de client-laag voor filteren,
// per-job detail, opnieuw-proberen en het verwerken van openstaande crawls.
//
// Crawl-fouten/fallbacks horen HIER, niet onder Issues (taak 8-scheiding).

import { getCrawlHealth } from '@/lib/v0/server/crawl-health';
import { MetricCard } from '../components/metric-card';
import { ReloadButton } from '../components/reload-button';
import { JobsClient } from './jobs-client';
import { buildJobRows } from './build-rows';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const health = await getCrawlHealth();

  const rows = buildJobRows(health);

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
