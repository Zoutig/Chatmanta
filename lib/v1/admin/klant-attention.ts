// V1 admin — 'Wat is er aan de hand' per klant (klant-detail, bovenaan).
//
// Hergebruikt de V1-attentiesignalen van het klantendashboard
// (lib/v1/dashboard/attention.ts: quiz, crawl mislukt, widget gepauzeerd/weg) en de
// limiet-checks (lib/v1/limits/usage-limits.ts), zodat de admin precies ziet wat
// de klant als rode stip ziet. Daarbovenop admin-only signalen: opgeschort,
// kostenplafond los van de daglimiet, widget nooit gezien, lege allowed_domains en
// open issues. Geen V0-health-logica (lib/controlroom/server/health.ts blijft
// ongemoeid).
//
// buildAdminAttentionItems is PUUR (getest); getAdminKlantAttention leest via de
// caller-geleverde admin-client (service-role NÁ requireJorionAdmin), elke read
// expliciet op organization_id (+ chatbot_id) en faalveilig.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAttentionSignals, WIDGET_MISSING_AFTER_MS, type AttentionSignals } from '@/lib/v1/dashboard/attention';
import {
  checkOrgDailyBudget,
  checkOrgDailyQuestions,
  checkOrgMonthlyQuestions,
  getOrgQuestionLimits,
} from '@/lib/v1/limits/usage-limits';

export type AdminAttentionInput = {
  suspended: boolean;
  hasChatbot: boolean;
  signals: AttentionSignals;
  dailyQuestionsReached: boolean;
  monthlyQuestionsReached: boolean;
  costCapReached: boolean;
  /** Ooit een heartbeat van de widget gezien. */
  widgetEverSeen: boolean;
  allowedDomainsEmpty: boolean;
  /** Mislukte crawl: het laatste foutbericht (of null). */
  crawlError: string | null;
  unansweredCount: number;
  openIssues: number;
};

export type AdminAttentionItem = {
  tone: 'danger' | 'warn' | 'info';
  text: string;
  href: string;
  action: string;
};

/** PURE: zet de signalen om in regels met een directe link naar de plek waar je het
 *  oplost. Volgorde = ernst (danger → warn → info). */
export function buildAdminAttentionItems(orgId: string, s: AdminAttentionInput): AdminAttentionItem[] {
  const base = `/v1/admin/organizations/${orgId}`;
  const out: AdminAttentionItem[] = [];

  if (s.suspended) {
    out.push({ tone: 'danger', text: 'Deze klant is opgeschort: de widget verschijnt niet.', href: `${base}?tab=beheer`, action: 'Naar Beheer' });
  }
  if (!s.hasChatbot) {
    out.push({ tone: 'danger', text: 'Deze klant heeft nog geen chatbot.', href: `${base}?tab=instellingen`, action: 'Naar Botinstellingen' });
  }
  if (s.monthlyQuestionsReached) {
    out.push({ tone: 'danger', text: 'De maandlimiet voor vragen is bereikt. De chatbot weigert tot de 1e van de maand.', href: `${base}?tab=beheer`, action: 'Limieten aanpassen' });
  } else if (s.dailyQuestionsReached) {
    out.push({ tone: 'danger', text: 'De daglimiet voor vragen is bereikt. De chatbot weigert tot morgen.', href: `${base}?tab=beheer`, action: 'Limieten aanpassen' });
  }
  if (s.costCapReached) {
    out.push({ tone: 'danger', text: 'Het interne kostenplafond van vandaag is op. De klant ziet "daglimiet bereikt".', href: `${base}?tab=beheer`, action: 'Kostenplafond aanpassen' });
  }
  if (s.signals.widgetPaused) {
    out.push({ tone: 'danger', text: 'De klant heeft de chatbot op pauze gezet. Bezoekers zien hem niet.', href: `${base}?tab=widget`, action: 'Naar Widget' });
  } else if (s.signals.widgetMissing) {
    out.push({ tone: 'danger', text: `De widget is al meer dan ${Math.round(WIDGET_MISSING_AFTER_MS / 86_400_000)} dagen niet gezien op de website.`, href: `${base}?tab=widget`, action: 'Naar Widget' });
  }
  if (s.signals.crawlFailed > 0) {
    const what = s.signals.crawlFailed === 1 ? 'Het ophalen van de website is mislukt' : `Het ophalen van ${s.signals.crawlFailed} websites is mislukt`;
    out.push({
      tone: 'danger',
      text: s.crawlError ? `${what}: ${s.crawlError}` : `${what}.`,
      href: `/v1/admin/jobs?org=${orgId}`,
      action: 'Naar Crawls',
    });
  }
  if (s.openIssues > 0) {
    out.push({
      tone: 'warn',
      text: s.openIssues === 1 ? 'Er staat 1 open fout voor deze klant.' : `Er staan ${s.openIssues} open fouten voor deze klant.`,
      href: `/v1/admin/issues?org=${orgId}`,
      action: 'Naar Issues',
    });
  }
  if (s.allowedDomainsEmpty && s.hasChatbot) {
    out.push({ tone: 'warn', text: 'Er zijn geen toegestane domeinen ingesteld: elke website kan deze widget plaatsen.', href: `${base}?tab=widget`, action: 'Domeinen instellen' });
  }
  if (s.unansweredCount > 0) {
    out.push({
      tone: 'warn',
      text: s.unansweredCount === 1 ? '1 vraag kon de chatbot de laatste 30 dagen niet beantwoorden.' : `${s.unansweredCount} vragen kon de chatbot de laatste 30 dagen niet beantwoorden.`,
      href: `${base}?tab=gesprekken`,
      action: 'Naar Gesprekken',
    });
  }
  if (!s.widgetEverSeen && s.hasChatbot && !s.suspended) {
    out.push({ tone: 'info', text: 'De widget is nog nooit gezien op een website.', href: `${base}?tab=widget`, action: 'Naar Widget' });
  }
  if (s.signals.quizReady) {
    out.push({ tone: 'info', text: 'Er staat een kennisquiz klaar die de klant nog niet heeft afgerond.', href: `/v1/admin/quiz/${orgId}`, action: 'Naar Quiz' });
  }
  return out;
}

const NO_ATTENTION_SIGNALS: AttentionSignals = {
  quizReady: false,
  crawlFailed: 0,
  widgetPaused: false,
  widgetMissing: false,
  monthlyLimitReached: false,
  dailyBudgetReached: false,
};

/** Leest alle signalen voor één org. Faalveilig: een hapering = 'niets aan de hand'. */
export async function getAdminKlantAttention(
  admin: SupabaseClient,
  orgId: string,
  chatbotId: string | null,
  suspended: boolean,
): Promise<AdminAttentionItem[]> {
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const limits = await getOrgQuestionLimits(admin, orgId);
  const [signals, daily, monthly, budget, bot, crawlErr, unanswered, issues] = await Promise.all([
    chatbotId ? getAttentionSignals(admin, orgId, chatbotId).catch(() => NO_ATTENTION_SIGNALS) : NO_ATTENTION_SIGNALS,
    checkOrgDailyQuestions(admin, orgId, limits.daily).catch(() => null),
    checkOrgMonthlyQuestions(admin, orgId, limits.monthly).catch(() => null),
    checkOrgDailyBudget(admin, orgId).catch(() => null),
    chatbotId
      ? admin
          .from('chatbots')
          .select('allowed_domains, widget_last_seen_at')
          .eq('organization_id', orgId)
          .eq('id', chatbotId)
          .maybeSingle()
          .then(
            (r) => r.data as { allowed_domains: string[] | null; widget_last_seen_at: string | null } | null,
            () => null,
          )
      : null,
    admin
      .from('processing_jobs')
      .select('error_message')
      .eq('organization_id', orgId)
      .eq('job_type', 'crawl_website')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(
        (r) => (r.data as { error_message: string | null } | null)?.error_message ?? null,
        () => null,
      ),
    chatbotId
      ? admin
          .from('query_log')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('chatbot_id', chatbotId)
          .eq('kind', 'fallback')
          .gte('created_at', since.toISOString())
          .then(
            (r) => r.count ?? 0,
            () => 0,
          )
      : 0,
    admin
      .from('admin_error_groups')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .in('severity', ['error', 'warning'])
      .then(
        (r) => r.count ?? 0,
        () => 0,
      ),
  ]);

  return buildAdminAttentionItems(orgId, {
    suspended,
    hasChatbot: chatbotId != null,
    signals,
    dailyQuestionsReached: daily?.over === true,
    monthlyQuestionsReached: monthly?.over === true,
    costCapReached: budget?.over === true,
    // Bij een leesfout (bot = null) geen valse 'nooit gezien'/'geen domeinen'.
    widgetEverSeen: bot ? Boolean(bot.widget_last_seen_at) : true,
    allowedDomainsEmpty: bot ? (bot.allowed_domains?.length ?? 0) === 0 : false,
    crawlError: crawlErr,
    unansweredCount: unanswered,
    openIssues: issues,
  });
}
