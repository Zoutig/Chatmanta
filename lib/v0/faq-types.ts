// V0 FAQ types — client-safe (geen 'server-only', geen Supabase/OpenAI imports).
//
// Deze file bestaat zodat client components (FaqView) types + constants
// kunnen importeren zonder de server-side faq-snapshot module in hun
// bundle te trekken. Server-laag (lib/v0/server/faq-snapshot.ts) re-exporteert
// deze types waar het ze nodig heeft.

export type FaqWindow = '24h' | '7d' | 'all';

/** Welke bot-versies de FAQ-tab toont. Bewust hardcoded — alleen de top-2
 *  actieve versies. Bij v0.6 release: update beide constanten. */
export const FAQ_BOT_VERSIONS = ['v0.4', 'v0.5'] as const;
export type FaqBotVersion = (typeof FAQ_BOT_VERSIONS)[number];

export type FaqItem = {
  /** 1-based ranking binnen de snapshot. */
  rank: number;
  /** Representative-question (meest recente exact-string variant in cluster). */
  question: string;
  /** Aantal hits binnen het window (som over alle members). */
  count: number;
  /** ISO timestamp van de meest recente hit. */
  lastAsked: string;
  /** Exact-string varianten die in dit cluster vielen (incl. representative). */
  memberQuestions: string[];
  /** answer_cache.id als deze cluster pre-gecached is, anders null. */
  cachedAnswerId: string | null;
  /** Beknopte reden voor de cache-keuze. */
  judgeReason?: 'judge-pick' | 'auto-pick-fallback' | 'reuse-existing-cache';
};

export type FaqSnapshot = {
  id: string;
  organizationId: string;
  botVersion: FaqBotVersion;
  window: FaqWindow;
  generatedAt: string;
  totalUnique: number;
  totalQueries: number;
  embedCostUsd: number;
  judgeCostUsd: number;
  items: FaqItem[];
};
