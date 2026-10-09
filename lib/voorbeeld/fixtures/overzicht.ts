// Vaste cijfers voor Overzicht in het voorbeeld-dashboard (druk vakantiepark).
// Top-vragen en onbeantwoorde vragen komen uit de gesprekken-fixture, zodat
// Overzicht en Gesprekken hetzelfde verhaal vertellen.

import type { V1OverviewMetrics } from '@/lib/v1/dashboard/metrics';
import { getFixtureFaq, getFixtureUnanswered } from './gesprekken';

/** Gesprekken per dag, oud → nieuw (laatste = vandaag tot nu). */
const TREND = [21, 24, 19, 27, 33, 38, 29, 25, 28, 31, 36, 42, 47, 34];

export function getFixtureOverviewMetrics(now: Date = new Date()): V1OverviewMetrics {
  const faq = getFixtureFaq(now);
  const unanswered = getFixtureUnanswered(now);
  const thisWeek = TREND.slice(7).reduce((s, n) => s + n, 0);
  const lastWeek = TREND.slice(0, 7).reduce((s, n) => s + n, 0);
  const threads = 418;
  const successful = 364;

  return {
    spendThisMonthEur: 3.84,
    refusalRate: 0.11,
    scannedThisMonth: 500,
    latency: { p50: 1850, p95: 3900 },
    topQuestions: faq.items.slice(0, 5).map((f) => ({
      question: f.question,
      count: f.count,
      unanswered: f.lastStatus === 'unanswered',
      lastAskedAt: f.lastAskedAt,
    })),
    unanswered,
    setup: { hasDocument: true, hasKnowledgeSource: true, hasTraffic: true },
    conversationsThisMonth: { threads, messages: 1286 },
    conversationsTrend: TREND,
    conversationsWeekDelta: {
      thisWeek,
      lastWeek,
      deltaPct: Math.round(((thisWeek - lastWeek) / lastWeek) * 100),
    },
    helpfulness: { rate: Math.round((successful / threads) * 100), successful, total: threads },
    sources: { websitePages: 32, documents: 4, qaItems: 7 },
    chatbotStatus: 'live',
    widgetStatus: 'active',
    weeklyAnswerSplit: { answered: 214, waiting: 9 },
    unansweredTotal: unanswered.reduce((s, u) => s + u.occurrences, 0),
    latestUnansweredAt: unanswered[0]?.lastSeenAt ?? null,
  };
}
