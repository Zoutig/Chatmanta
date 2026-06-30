// V1 klant-dashboard — Overzicht-metrics. Pure-ish read-helper die UITSLUITEND
// V1-tabellen leest via de doorgegeven session-client (RLS afgedwongen) + org &
// chatbot expliciet gefilterd (defense-in-depth). Geen service-role: alleen reads.
//
// ponytail: één gecapte scan (newest N deze maand) voedt top-vragen + weiger-ratio
// + latency + onbeantwoord ineens; gesprekken/kosten hergebruiken de exacte
// usage-limits-helpers i.p.v. eigen sommen. Ceiling: bij hoog volume capt de scan
// op SCAN_LIMIT rijen (V1-volumes zijn klein) → upgrade naar een SQL-aggregatie of
// materialized view als dat knelt. Geen `import 'server-only'` zodat de pure
// percentile-helper unit-testbaar blijft (zelfde patroon als usage-limits.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getOrgConversationsThisMonth,
  getOrgSpendThisMonthEur,
  startOfUtcMonthIso,
} from '@/lib/v1/limits/usage-limits';

const SCAN_LIMIT = 500;
const TOP_N = 5;

export type TopQuestion = { question: string; count: number; unanswered: boolean };
export type UnansweredItem = { question: string; occurrences: number; lastSeenAt: string };

export type V1OverviewMetrics = {
  conversationsThisMonth: number;
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

function isRefusal(kind: string | null, category: string | null): boolean {
  return kind === 'fallback' || kind === 'blocked' || category === 'off_topic';
}

export async function getV1OverviewMetrics(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<V1OverviewMetrics> {
  const sinceMonth = startOfUtcMonthIso(new Date());

  // Alles parallel — niets hangt van iets anders af. Head-counts falen open → 0
  // (een setup-stap defaultt dan op "nog te doen", een veilige nudge).
  const [conversationsThisMonth, spendThisMonthEur, scanRes, docRes, sourceRes, trafficRes] =
    await Promise.all([
      getOrgConversationsThisMonth(client, orgId),
      getOrgSpendThisMonthEur(client, orgId),
      client
        .from('query_log')
        .select('kind, question, category, total_ms, created_at')
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId)
        .gte('created_at', sinceMonth)
        .order('created_at', { ascending: false })
        .limit(SCAN_LIMIT),
      client
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId)
        .eq('included', true)
        .is('deleted_at', null),
      client
        .from('knowledge_sources')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId)
        .is('deleted_at', null),
      client
        .from('query_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId),
    ]);

  const rows = (scanRes.data ?? []) as ScanRow[];
  const total = rows.length;

  let refusals = 0;
  const latencies: number[] = [];
  // Rijen komen nieuwste-eerst binnen → de eerste keer dat we een vraag-key zien is
  // meteen de meest recente (zet status/lastSeen daar, overschrijf niet).
  const topMap = new Map<string, TopQuestion>();
  const unansweredMap = new Map<string, UnansweredItem>();

  for (const r of rows) {
    if (isRefusal(r.kind, r.category)) refusals += 1;
    if (typeof r.total_ms === 'number') latencies.push(r.total_ms);

    const q = (r.question ?? '').trim();
    if (!q) continue;
    const key = q.toLowerCase();

    if (r.kind === 'answer' || r.kind === 'fallback') {
      const ex = topMap.get(key);
      if (ex) ex.count += 1;
      else topMap.set(key, { question: q, count: 1, unanswered: r.kind === 'fallback' });
    }
    if (r.kind === 'fallback') {
      const ex = unansweredMap.get(key);
      if (ex) ex.occurrences += 1;
      else unansweredMap.set(key, { question: q, occurrences: 1, lastSeenAt: r.created_at ?? '' });
    }
  }

  latencies.sort((a, b) => a - b);
  const topQuestions = [...topMap.values()].sort((a, b) => b.count - a.count).slice(0, TOP_N);
  const unanswered = [...unansweredMap.values()]
    .sort((a, b) => b.occurrences - a.occurrences || b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, TOP_N);

  return {
    conversationsThisMonth,
    spendThisMonthEur,
    refusalRate: total === 0 ? null : refusals / total,
    scannedThisMonth: total,
    latency: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    topQuestions,
    unanswered,
    setup: {
      hasDocument: (docRes.count ?? 0) > 0,
      hasKnowledgeSource: (sourceRes.count ?? 0) > 0,
      hasTraffic: (trafficRes.count ?? 0) > 0,
    },
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
