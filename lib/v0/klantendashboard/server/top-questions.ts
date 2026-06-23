// V0 klantendashboard — "Meest gestelde vragen" data-wrapper.
//
// Aggregeert query_log per organization: groepeert op vraag (trim+lowercase),
// telt voorkomens, en sorteert op count desc. Filter op kind in ('answer',
// 'fallback') — dat zijn echte vragen waar de bot iets mee deed (al dan niet
// succesvol). Smalltalk en blocked-queries blijven buiten beeld.
//
// Pattern volgt lib/v0/server/knowledge-gap-snapshot.ts:90-126 — dezelfde
// dedupe-strategie maar dan agnostic over bot-version (de klant boeit niet
// welke bot-versie 'm beantwoordde, alleen of de vraag vaak terugkomt).

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/admin';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { RETENTION_REDACTED } from '@/lib/v0/retention-sentinel';
import { getKlantFaqSnapshot, type KlantFaqItem } from './faq-klant';
import type { TopQuestionsConfig } from '../types';

export type TopQuestion = {
  question: string;
  count: number;
  lastAskedAt: string;
  /**
   * Status van de meest recente keer dat deze vraag werd beantwoord.
   * 'answered'    = bot gaf een echt antwoord (kind='answer')
   * 'unanswered'  = bot ging in fallback (kind='fallback')
   */
  lastStatus: 'answered' | 'unanswered';
};

/**
 * Result-shape voor het Klantendashboard "Meest gestelde vragen"-scherm:
 *   - items: vragen ná filtering op config.minCount, max config.topN groot.
 *   - totalUnique: aantal unieke vragen vóór filtering. De UI gebruikt
 *                  dit om onderscheid te maken tussen "echt geen vragen"
 *                  (=0) en "geen vragen die de drempel halen" (>0 maar
 *                  items.length=0).
 */
export type TopQuestionsResult = {
  items: TopQuestion[];
  totalUnique: number;
};

// Hard cap op SELECT om memory onder controle te houden.
const MAX_ROWS_SCANNED = 500;

export async function getTopQuestions(
  orgSlug: OrgSlug,
  config: TopQuestionsConfig,
): Promise<TopQuestionsResult> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  try {
    const { data, error } = await getServiceRoleClient()
      .from('query_log')
      .select('question, kind, created_at')
      .eq('organization_id', orgId)
      .in('kind', ['answer', 'fallback'])
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS_SCANNED);
    if (error || !data) return { items: [], totalUnique: 0 };

    const map = new Map<string, TopQuestion>();
    for (const r of data) {
      const q = String(r.question ?? '').trim();
      if (!q || q === RETENTION_REDACTED) continue;
      const key = q.toLowerCase();
      const createdAt = String(r.created_at ?? '');
      const status: TopQuestion['lastStatus'] =
        r.kind === 'fallback' ? 'unanswered' : 'answered';

      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (createdAt > existing.lastAskedAt) {
          existing.lastAskedAt = createdAt;
          existing.lastStatus = status;
        }
      } else {
        map.set(key, {
          question: q,
          count: 1,
          lastAskedAt: createdAt,
          lastStatus: status,
        });
      }
    }

    const totalUnique = map.size;
    const items = [...map.values()]
      .filter((q) => q.count >= config.minCount)
      .sort(
        (a, b) =>
          b.count - a.count ||
          (b.lastAskedAt > a.lastAskedAt ? 1 : a.lastAskedAt > b.lastAskedAt ? -1 : 0),
      )
      .slice(0, config.topN);
    return { items, totalUnique };
  } catch {
    return { items: [], totalUnique: 0 };
  }
}

// ---------------------------------------------------------------------------
// Snapshot-gebaseerde read (M5) — VERVANGT de live-scan hierboven als bron
// voor het dashboard. getTopQuestions() blijft bestaan voor backward-compat,
// maar de UI leest sinds M5 de periodieke snapshot (klant_faq_snapshot) zodat
// de tellingen overal consistent zijn en de semantische clustering meekomt.
// ---------------------------------------------------------------------------

/**
 * Eén geclusterde rij voor het dashboard. Spiegelt KlantFaqItem maar met de
 * UI-vriendelijke veldnamen die de bestaande TopQuestion-renderers gebruiken,
 * aangevuld met de cluster-info (memberQuestions/paraphraseCount) voor de hint
 * + drilldown.
 */
export type KlantFaqRow = {
  question: string;
  count: number;
  lastAskedAt: string;
  lastStatus: 'answered' | 'unanswered';
  /** Alle exact-string varianten in de cluster (de representatieve vraag incl.). */
  memberQuestions: string[];
  /** Aantal extra formuleringen bovenop de representatieve vraag (= varianten - 1,
   *  min 0). > 0 → toon de "+N formuleringen"-hint. */
  paraphraseCount: number;
};

/**
 * Result-shape voor de dashboard-consumenten (gesprekken-tab + overzicht-bars).
 *   - items:        clusters ná read-time filter (count >= minCount, slice topN).
 *   - totalUnique:  totaal aantal unieke vragen in de snapshot (vóór filter),
 *                   zodat de UI "echt geen vragen" (0) van "geen vraag boven de
 *                   drempel" (>0) kan onderscheiden.
 *   - pending:      true zolang er nog GEEN snapshot is (cron heeft nog niet
 *                   gedraaid). De UI toont dan de "wordt periodiek bijgewerkt"-
 *                   melding i.p.v. een lege ranglijst.
 *   - generatedAt:  wanneer de snapshot is berekend (null bij pending).
 */
export type KlantFaqResult = {
  items: KlantFaqRow[];
  totalUnique: number;
  pending: boolean;
  generatedAt: string | null;
};

function itemToRow(it: KlantFaqItem): KlantFaqRow {
  return {
    question: it.question,
    count: it.count,
    lastAskedAt: it.lastAskedAt,
    lastStatus: it.lastStatus,
    memberQuestions: it.memberQuestions,
    paraphraseCount: Math.max(0, it.memberQuestions.length - 1),
  };
}

/**
 * Lees de meest recente FAQ-snapshot voor de org en pas de per-org config als
 * READ-TIME filter toe (count >= minCount, daarna slice op topN). De snapshot
 * bewaart tot 20 items op count desc, dus het filteren/slicen vereist geen
 * herberekening. Null snapshot → pending-state (cron nog niet gedraaid).
 */
export async function getKlantFaqForDashboard(
  orgSlug: OrgSlug,
  config: TopQuestionsConfig,
): Promise<KlantFaqResult> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const snapshot = await getKlantFaqSnapshot(orgId);
  if (!snapshot) {
    return { items: [], totalUnique: 0, pending: true, generatedAt: null };
  }
  // Snapshot-items zijn al op count desc gerankt; filter + slice volstaat.
  const items = snapshot.items
    .filter((it) => it.count >= config.minCount)
    .slice(0, config.topN)
    .map(itemToRow);
  return {
    items,
    totalUnique: snapshot.totalUnique,
    pending: false,
    generatedAt: snapshot.generatedAt,
  };
}
