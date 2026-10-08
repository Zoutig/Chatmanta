// V1 aandacht-signalen (spec 2026-10-07 §6 + bijlage A): één bron voor de stippen
// in de zijbalk én het kritiek-blok op Overzicht, zodat ze nooit iets anders zeggen.
//
// Reads via de caller-geleverde session-client (RLS); org + chatbot expliciet
// gefilterd. Faalveilig: bij een hapering valt elk signaal terug op "niets aan de
// hand" (nooit een valse rode stip door een DB-fout).

import type { SupabaseClient } from '@supabase/supabase-js';
import { checkOrgDailyBudget, checkOrgMonthlyLimit } from '@/lib/v1/limits/usage-limits';
import { getActiveQuizForOrg } from '@/lib/v1/quiz/data';

/** Hoe lang de widget weg mag zijn (na eerder gezien te zijn) voor het een kritiek signaal wordt. */
export const WIDGET_MISSING_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type AttentionSignals = {
  /** Er staat een kennisquiz met open vragen klaar. */
  quizReady: boolean;
  /** Aantal websitebronnen waarvan de laatste crawl mislukte. */
  crawlFailed: number;
  /** Klant heeft de widget/chatbot op pauze gezet. */
  widgetPaused: boolean;
  /** Widget was eerder live gezien, maar al WIDGET_MISSING_AFTER_MS niet meer. */
  widgetMissing: boolean;
  monthlyLimitReached: boolean;
  dailyBudgetReached: boolean;
};

export const NO_SIGNALS: AttentionSignals = {
  quizReady: false,
  crawlFailed: 0,
  widgetPaused: false,
  widgetMissing: false,
  monthlyLimitReached: false,
  dailyBudgetReached: false,
};

export async function getAttentionSignals(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
  now: number = Date.now(),
): Promise<AttentionSignals> {
  const [quiz, crawlFailed, bot, monthly, daily] = await Promise.all([
    getActiveQuizForOrg(client, orgId).catch(() => null),
    countFailedCrawls(client, orgId, chatbotId).catch(() => 0),
    client
      .from('chatbots')
      .select('is_active, widget_last_seen_at')
      .eq('organization_id', orgId)
      .eq('id', chatbotId)
      .maybeSingle()
      .then((r) => r.data as { is_active: boolean | null; widget_last_seen_at: string | null } | null)
      .then(
        (d) => d,
        () => null,
      ),
    checkOrgMonthlyLimit(client, orgId).catch(() => null),
    checkOrgDailyBudget(client, orgId).catch(() => null),
  ]);

  const quizReady =
    quiz?.status === 'actief' && quiz.questionCount - quiz.answeredCount - quiz.skippedCount > 0;

  const lastSeen = bot?.widget_last_seen_at ? Date.parse(bot.widget_last_seen_at) : NaN;
  const widgetPaused = bot?.is_active === false;
  const widgetMissing = !widgetPaused && Number.isFinite(lastSeen) && now - lastSeen > WIDGET_MISSING_AFTER_MS;

  return {
    quizReady: Boolean(quizReady),
    crawlFailed,
    widgetPaused,
    widgetMissing,
    monthlyLimitReached: monthly?.over === true,
    dailyBudgetReached: daily?.over === true,
  };
}

/** Websitebronnen (niet verwijderd) waarvan de nieuwste crawl-job 'failed' is. */
async function countFailedCrawls(client: SupabaseClient, orgId: string, chatbotId: string): Promise<number> {
  const { data: sources } = await client
    .from('knowledge_sources')
    .select('id')
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId)
    .eq('type', 'website')
    .is('deleted_at', null);
  const ids = (sources ?? []).map((s) => s.id as string);
  if (ids.length === 0) return 0;

  const { data: jobs } = await client
    .from('processing_jobs')
    .select('target_id, status, created_at')
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId)
    .eq('job_type', 'crawl_website')
    .in('target_id', ids)
    .order('created_at', { ascending: false });

  const latest = new Map<string, string>();
  for (const j of jobs ?? []) {
    const tid = j.target_id as string;
    if (!latest.has(tid)) latest.set(tid, j.status as string);
  }
  let failed = 0;
  for (const status of latest.values()) if (status === 'failed') failed += 1;
  return failed;
}

/** Kritieke punten in klanttaal, voor het samengevoegde blok op Overzicht. */
export function criticalItems(s: AttentionSignals): { text: string; href: string; action: string }[] {
  const out: { text: string; href: string; action: string }[] = [];
  if (s.monthlyLimitReached) {
    out.push({ text: 'De maandlimiet voor gesprekken is bereikt. Je chatbot pauzeert tot de 1e van de maand.', href: '/v1/app/account', action: 'Bekijk verbruik' });
  } else if (s.dailyBudgetReached) {
    out.push({ text: 'Het dagbudget is op. Je chatbot pauzeert tot morgen.', href: '/v1/app/account', action: 'Bekijk verbruik' });
  }
  if (s.widgetPaused) {
    out.push({ text: 'Je chatbot staat op pauze. Bezoekers zien hem niet.', href: '/v1/app/widget', action: 'Naar Widget' });
  } else if (s.widgetMissing) {
    out.push({ text: 'Je widget is al een week niet gezien op je website.', href: '/v1/app/widget', action: 'Controleer installatie' });
  }
  if (s.crawlFailed > 0) {
    out.push({
      text:
        s.crawlFailed === 1
          ? 'Het ophalen van je website is mislukt.'
          : `Het ophalen van ${s.crawlFailed} websites is mislukt.`,
      href: '/v1/app/kennisbank?tab=website',
      action: 'Naar Kennisbank',
    });
  }
  return out;
}
