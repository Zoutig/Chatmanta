// Admin Dashboard — Crawl & Jobs: server-side mapping van CrawlHealthRow naar de
// plain JobRow-DTO die de client-laag (jobs-client.tsx) rendert. Gedeeld door de
// globale /jobs-pagina én de per-klant Crawls&Jobs-tab, zodat beide exact dezelfde
// verrijkte rijen tonen (categorie-label, aanbevolen fix, decision-labels) zonder
// dat de client een server-only module hoeft te importeren.

import {
  type CrawlHealth,
  CATEGORY_LABEL,
  RECOMMENDED_FIX,
  DECISION_LABEL,
} from '@/lib/v0/server/crawl-health';
import type { JobRow } from './jobs-client';

export function buildJobRows(health: CrawlHealth): JobRow[] {
  return health.recent.map((r) => ({
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
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    externalJobId: r.externalJobId,
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
}
