// V1 klant-dashboard — Overzicht-metrics. Pure-ish read-helper die UITSLUITEND
// V1-tabellen leest via de doorgegeven session-client (RLS afgedwongen) + org &
// chatbot expliciet gefilterd (defense-in-depth). Geen service-role: alleen reads.
//
// ponytail: één gecapte scan (newest N deze maand) voedt top-vragen + weiger-ratio
// + latency + onbeantwoord ineens; gesprekken/kosten hergebruiken de exacte
// usage-limits-helpers i.p.v. eigen sommen. 14-dag scan (apart) voedt trend +
// week-delta + weeklyAnswerSplit. Helpfulness = 1 − refusal-rate over query_log
// (query-level proxy; per-thread feedback-join als het volume dat rechtvaardigt).
// Ceiling: bij hoog volume capt de scan op SCAN_LIMIT rijen → upgrade naar SQL-
// aggregatie of materialized view. Geen `import 'server-only'` zodat de pure
// percentile-helper unit-testbaar blijft (zelfde patroon als usage-limits.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getOrgConversationsThisMonth,
  getOrgSpendThisMonthEur,
  startOfUtcMonthIso,
} from '@/lib/v1/limits/usage-limits';

const SCAN_LIMIT = 500;
const TOP_N = 5;

export type TopQuestion = {
  question: string;
  count: number;
  unanswered: boolean;
  /** ISO-timestamp van de meest recente vraag in deze bucket (eerste hit in de
   *  nieuwste-eerst-scan). Voedt de KlantFaqResult-adapter in page.tsx. */
  lastAskedAt: string;
};
export type UnansweredItem = { question: string; occurrences: number; lastSeenAt: string };

export type V1OverviewMetrics = {
  spendThisMonthEur: number;
  /** Aandeel weigeringen (fallback/blocked/off_topic) over de gescande maand-rijen.
   *  null = geen verkeer deze maand. */
  refusalRate: number | null;
  /** Aantal query_log-rijen dat de scan zag (≤ SCAN_LIMIT) — noemer van refusalRate. */
  scannedThisMonth: number;
  latency: { p50: number | null; p95: number | null };
  topQuestions: TopQuestion[];
  unanswered: UnansweredItem[];
  setup: { hasDocument: boolean; hasKnowledgeSource: boolean; hasTraffic: boolean };

  // Velden die de gere-importen V0-componenten (MetricStrip, TriagePanel,
  // TopQuestionsBars) indirect nodig hebben via de adapter in page.tsx.
  // Spiegelen de gelijknamige velden in OverviewMetrics (lib/v0/klantendashboard/types.ts).
  conversationsThisMonth: { threads: number; messages: number };
  conversationsTrend: number[];
  conversationsWeekDelta: { thisWeek: number; lastWeek: number; deltaPct: number | null };
  helpfulness: { rate: number | null; successful: number; total: number };
  sources: { websitePages: number; documents: number; qaItems: number };
  chatbotStatus: 'concept' | 'testing' | 'live' | 'paused';
  widgetStatus: 'not_installed' | 'detected' | 'active';
  weeklyAnswerSplit: { answered: number; waiting: number };
  /** Totaal aantal kind='fallback' rijen in de maand-scan — voedt TriagePanel total. */
  unansweredTotal: number;
  /** created_at van de meest recente fallback-row (ISO), of null. */
  latestUnansweredAt: string | null;
};

/** Nearest-rank percentiel over een OPLOPEND-gesorteerde array. p in [0,1].
 *  Lege array → null. Pure → testbaar. */
export function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

type ScanRow = {
  kind: string | null;
  question: string | null;
  category: string | null;
  total_ms: number | null;
  created_at: string | null;
};

type TwoWeekRow = { kind: string | null; created_at: string | null };

function isRefusal(kind: string | null, category: string | null): boolean {
  return kind === 'fallback' || kind === 'blocked' || category === 'off_topic';
}

export async function getV1OverviewMetrics(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<V1OverviewMetrics> {
  const sinceMonth = startOfUtcMonthIso(new Date());
  const nowMs = Date.now();
  // 14-daagse grens — voedt trend-array + week-delta + weeklyAnswerSplit.
  const since14daysIso = new Date(nowMs - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Alles parallel — niets hangt van iets anders af. Head-counts falen open → 0
  // (een setup-stap defaultt dan op "nog te doen", een veilige nudge).
  const [
    messagesThisMonth,
    spendThisMonthEur,
    scanRes,
    docRes,
    sourceRes,
    trafficRes,
    threadsRes,
    twoWeekRes,
    orgRes,
    qaItemsRes,
    websitePagesRes,
  ] = await Promise.all([
    // Maand-turns (= messages) — getOrgConversationsThisMonth telt query_log-rijen.
    getOrgConversationsThisMonth(client, orgId),
    getOrgSpendThisMonthEur(client, orgId),
    // Maand-scan: kind/question/category/latency voor ratio, top-vragen, onbeantwoord.
    client
      .from('query_log')
      .select('kind, question, category, total_ms, created_at')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .gte('created_at', sinceMonth)
      .order('created_at', { ascending: false })
      .limit(SCAN_LIMIT),
    // Setup: heeft de org minstens één verwerkt document?
    client
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .eq('included', true)
      .is('deleted_at', null),
    // Setup: heeft de org minstens één kennisbron?
    client
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .is('deleted_at', null),
    // Setup: heeft de org ooit verkeer gehad?
    client
      .from('query_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId),
    // Threads-teller deze maand (gesprekken, niet turns) — voedt conversationsThisMonth.threads.
    client
      .from('threads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .gte('created_at', sinceMonth),
    // 14-dag scan — leichtgewicht (kind+created_at) voor trend + delta + weekSplit.
    client
      .from('query_log')
      .select('kind, created_at')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .gte('created_at', since14daysIso)
      .order('created_at', { ascending: false })
      .limit(SCAN_LIMIT),
    // Widget-status: allowed_domains-aanwezigheid als proxy voor "geïnstalleerd".
    client.from('organizations').select('allowed_domains').eq('id', orgId).maybeSingle(),
    // Actieve bronnen: Q&A-items.
    client
      .from('org_qa_items')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    // Actieve bronnen: gecrawlde pagina's (documents mét source_url).
    client
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .not('source_url', 'is', null)
      .eq('included', true)
      .is('deleted_at', null),
  ]);

  // --- Maand-scan verwerking ---
  const rows = (scanRes.data ?? []) as ScanRow[];
  const total = rows.length;

  let refusals = 0;
  let unansweredTotal = 0;
  let latestUnansweredAt: string | null = null;
  const latencies: number[] = [];
  const topMap = new Map<string, TopQuestion>();
  const unansweredMap = new Map<string, UnansweredItem>();

  // Rijen komen nieuwste-eerst binnen → eerste keer dat we een vraag-key zien
  // is de meest recente (sla status/lastSeen dan op, overschrijf niet).
  for (const r of rows) {
    if (isRefusal(r.kind, r.category)) refusals += 1;
    if (typeof r.total_ms === 'number') latencies.push(r.total_ms);

    if (r.kind === 'fallback') {
      unansweredTotal += 1;
      if (!latestUnansweredAt) latestUnansweredAt = r.created_at ?? null;
    }

    const q = (r.question ?? '').trim();
    if (!q) continue;
    const key = q.toLowerCase();

    if (r.kind === 'answer' || r.kind === 'fallback') {
      const ex = topMap.get(key);
      if (ex) ex.count += 1;
      else
        topMap.set(key, {
          question: q,
          count: 1,
          unanswered: r.kind === 'fallback',
          lastAskedAt: r.created_at ?? '',
        });
    }
    if (r.kind === 'fallback') {
      const ex = unansweredMap.get(key);
      if (ex) ex.occurrences += 1;
      else unansweredMap.set(key, { question: q, occurrences: 1, lastSeenAt: r.created_at ?? '' });
    }
  }

  // --- 14-dag scan verwerking ---
  const twoWeekRows = (twoWeekRes.data ?? []) as TwoWeekRow[];
  const since7msAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const since14msAgo = nowMs - 14 * 24 * 60 * 60 * 1000;

  // ponytail: trend-array index 0 = 14 dagen geleden, index 13 = vandaag.
  const conversationsTrend: number[] = new Array<number>(14).fill(0);
  let thisWeek = 0, lastWeek = 0;
  let weekAnswered = 0, weekWaiting = 0;

  for (const r of twoWeekRows) {
    if (!r.created_at) continue;
    const t = new Date(r.created_at).getTime();
    const daysAgo = Math.floor((nowMs - t) / 86_400_000);
    if (daysAgo >= 0 && daysAgo < 14) conversationsTrend[13 - daysAgo] += 1;
    if (t >= since7msAgo) {
      thisWeek += 1;
      if (r.kind === 'answer') weekAnswered += 1;
      else if (r.kind === 'fallback') weekWaiting += 1;
    } else if (t >= since14msAgo) {
      lastWeek += 1;
    }
  }
  const deltaPct =
    lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);

  // --- Helpfulness (query-level proxy) ---
  // ponytail: 1 − refusal-rate over de maand-scan. Upgrade naar per-thread
  // fallback-join als V1-klanten behoefte hebben aan nauwkeurigere conversatie-
  // level statistieken.
  const threadsCount = threadsRes.count ?? 0;
  const helpfulnessRate = total === 0 ? null : Math.round(((total - refusals) / total) * 100);

  // --- Bronnen ---
  const websitePages = websitePagesRes.count ?? 0;
  const docUploads = Math.max(0, (docRes.count ?? 0) - websitePages);
  const qaItems = qaItemsRes.count ?? 0;

  // --- Setup + afgeleide statussen ---
  const hasDocument = (docRes.count ?? 0) > 0;
  const hasKnowledgeSource = (sourceRes.count ?? 0) > 0;
  const hasTraffic = (trafficRes.count ?? 0) > 0;

  // ponytail: chatbotStatus afgeleid van setup-signalen i.p.v. een extra DB-kolom.
  const chatbotStatus: V1OverviewMetrics['chatbotStatus'] = hasTraffic
    ? 'live'
    : hasDocument || hasKnowledgeSource
      ? 'testing'
      : 'concept';

  const orgData = (orgRes.data as { allowed_domains: string[] | null } | null);
  const widgetStatus: V1OverviewMetrics['widgetStatus'] =
    (orgData?.allowed_domains?.length ?? 0) > 0 ? 'detected' : 'not_installed';

  // --- Sorteer + slice ---
  latencies.sort((a, b) => a - b);
  const topQuestions = [...topMap.values()].sort((a, b) => b.count - a.count).slice(0, TOP_N);
  const unanswered = [...unansweredMap.values()]
    .sort((a, b) => b.occurrences - a.occurrences || b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, TOP_N);

  return {
    spendThisMonthEur,
    refusalRate: total === 0 ? null : refusals / total,
    scannedThisMonth: total,
    latency: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    topQuestions,
    unanswered,
    setup: { hasDocument, hasKnowledgeSource, hasTraffic },

    conversationsThisMonth: { threads: threadsCount, messages: messagesThisMonth },
    conversationsTrend,
    conversationsWeekDelta: { thisWeek, lastWeek, deltaPct },
    helpfulness: {
      rate: helpfulnessRate,
      successful:
        helpfulnessRate !== null
          ? Math.max(0, Math.round((helpfulnessRate / 100) * threadsCount))
          : 0,
      total: threadsCount,
    },
    sources: { websitePages, documents: docUploads, qaItems },
    chatbotStatus,
    widgetStatus,
    weeklyAnswerSplit: { answered: weekAnswered, waiting: weekWaiting },
    unansweredTotal,
    latestUnansweredAt,
  };
}

// ponytail: zelf-check op de enige niet-triviale logica (percentiel + nearest-rank-
// grenzen). Draait alleen bij directe uitvoering: `npx tsx lib/v1/dashboard/metrics.ts`.
async function demo() {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error('FAIL: ' + m);
  };
  assert(percentile([], 0.5) === null, 'lege array → null');
  assert(percentile([10], 0.95) === 10, 'enkel element → dat element');
  assert(percentile([1, 2, 3, 4], 0.5) === 2, 'p50 nearest-rank (n even)');
  assert(percentile([1, 2, 3, 4], 0.95) === 4, 'p95 → laatste');
  assert(percentile([5, 10, 15, 20, 25], 0.5) === 15, 'p50 (n oneven)');
  console.log('metrics self-check OK');
}
if (process.argv[1]?.endsWith('metrics.ts')) void demo();
