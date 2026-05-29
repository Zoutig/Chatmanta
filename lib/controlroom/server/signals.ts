// Control Room — per-org live signalen → ControlRoomKlant.
//
// Combineert de admin-overlay (profiel) met LIVE data uit bestaande modules en
// leidt technische status + health af. Bewust GOEDKOPE reads (head-counts +
// één settings-row + één website-bronnen-fetch per org) i.p.v. de zware
// getOverviewMetrics, zodat de 5-orgs fan-out snel blijft. Dit is de centrale
// read-laag voor zowel de Overview als de Klantenlijst.

import 'server-only';

import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { getWebsiteSources, type CrawlJobStatus } from '@/lib/v0/server/crawler';
import type { WidgetStatus } from '@/lib/v0/klantendashboard/types';
import type {
  AdminOrgProfile,
  CommercialStatus,
  HealthStatus,
  TechnicalStatus,
} from '../types';
import { deriveHealth, deriveTechnicalStatus, type OrgSignals } from './health';
import { countRecentCriticalErrors } from './errors';
import {
  daysAgoIso,
  getDocumentCount,
  getLastActivityAt,
  getMonthlyCostUsd,
  getQueryLogStats,
  getThreadCount,
  startOfMonthIso,
  startOfWeekIso,
} from './usage';

export type ControlRoomKlant = {
  slug: OrgSlug;
  orgId: string;
  name: string;
  profile: AdminOrgProfile;
  commercialStatus: CommercialStatus;
  technicalStatus: TechnicalStatus;
  health: HealthStatus;
  healthReasons: string[];
  widgetStatus: WidgetStatus;
  sources: { websitePages: number; documents: number; qaItems: number; total: number };
  conversationsThisWeek: number;
  conversationsThisMonth: number;
  unansweredCount: number;
  fallbackPct: number | null;
  crawlStatus: CrawlJobStatus | null;
  crawlAnyFailed: boolean;
  crawlError: string | null;
  monthCostUsd: number;
  lastActivityAt: string | null;
};

/** Vat de crawl-jobs van alle website-bronnen samen tot één status + faal-flag.
 *  Prioriteit: lopend (processing/pending) > gefaald > completed > null. */
function summarizeCrawl(sources: Awaited<ReturnType<typeof getWebsiteSources>>): {
  status: CrawlJobStatus | null;
  anyFailed: boolean;
  error: string | null;
  activePages: number;
} {
  let anyFailed = false;
  let error: string | null = null;
  let running = false;
  let completed = false;
  let activePages = 0;
  for (const s of sources) {
    const js = s.job?.status ?? null;
    if (js === 'failed' || s.source.status === 'failed') {
      anyFailed = true;
      error = error ?? s.job?.error ?? null;
    }
    if (js === 'processing' || js === 'pending') running = true;
    if (js === 'completed') completed = true;
    activePages += s.pages.filter((p) => p.status === 'active').length;
  }
  const status: CrawlJobStatus | null = running
    ? 'processing'
    : anyFailed
      ? 'failed'
      : completed
        ? 'completed'
        : null;
  return { status, anyFailed, error, activePages };
}

export async function getOrgSignals(
  slug: OrgSlug,
  profile: AdminOrgProfile,
): Promise<ControlRoomKlant> {
  const orgId = KNOWN_ORGS[slug].id;
  const monthIso = startOfMonthIso();

  const [
    settings,
    websiteSources,
    docCount,
    threadsMonth,
    threadsWeek,
    qlMonth,
    fb30,
    monthCostUsd,
    lastActivityAt,
    recentErrorCount,
  ] = await Promise.all([
    getOrgSettings(slug).catch(() => null),
    getWebsiteSources(orgId).catch(() => []),
    getDocumentCount(orgId).catch(() => 0),
    getThreadCount(orgId, monthIso).catch(() => 0),
    getThreadCount(orgId, startOfWeekIso(0)).catch(() => 0),
    getQueryLogStats(orgId, monthIso).catch(() => ({ total: 0, fallback: 0 })),
    getQueryLogStats(orgId, daysAgoIso(30)).catch(() => ({ total: 0, fallback: 0 })),
    getMonthlyCostUsd(orgId).catch(() => 0),
    getLastActivityAt(orgId).catch(() => null),
    countRecentCriticalErrors(orgId).catch(() => 0),
  ]);

  const widget = settings?.widget;
  const widgetStatus: WidgetStatus = widget?.isActive
    ? 'active'
    : widget?.isInstalled
      ? 'detected'
      : 'not_installed';
  const qaActive = (settings?.qa ?? []).filter((q) => q.active).length;

  const crawl = summarizeCrawl(websiteSources);
  const sources = {
    websitePages: crawl.activePages,
    documents: docCount,
    qaItems: qaActive,
    total: crawl.activePages + docCount + qaActive,
  };

  // Fallback-% deze maand (null als er geen verkeer was). unansweredCount =
  // aantal fallback-vragen in de laatste 30 dagen (proxy voor "open" vragen).
  const fallbackPct = qlMonth.total > 0 ? Math.round((qlMonth.fallback / qlMonth.total) * 100) : null;
  const unansweredCount = fb30.fallback;

  const signals: OrgSignals = {
    hasActiveSources: sources.total > 0,
    sourceCount: sources.total,
    widgetStatus,
    crawlLatestStatus: crawl.status,
    crawlAnyFailed: crawl.anyFailed,
    fallbackPct,
    conversationsThisMonth: threadsMonth,
    conversationsThisWeek: threadsWeek,
    recentCriticalErrorCount: recentErrorCount,
  };

  const technicalStatus = deriveTechnicalStatus(signals, profile.technicalStatusOverride);
  const health = deriveHealth(
    signals,
    technicalStatus,
    profile.commercialStatus,
  );

  return {
    slug,
    orgId,
    name: KNOWN_ORGS[slug].name,
    profile,
    commercialStatus: profile.commercialStatus,
    technicalStatus,
    health: health.status,
    healthReasons: health.reasons,
    widgetStatus,
    sources,
    conversationsThisWeek: threadsWeek,
    conversationsThisMonth: threadsMonth,
    unansweredCount,
    fallbackPct,
    crawlStatus: crawl.status,
    crawlAnyFailed: crawl.anyFailed,
    crawlError: crawl.error,
    monthCostUsd,
    lastActivityAt,
  };
}
