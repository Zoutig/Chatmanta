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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import type { TopQuestionsConfig } from '../types';

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

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
    const { data, error } = await sb()
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
      if (!q) continue;
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
