// Cache-epoch-guard tegen de stale-write-race (plan 006, migr V0 0054 / V1 0021).
//
// purgeAnswerCache bumpt de per-org epoch; de engine leest de epoch bij
// pipeline-start en vlak vóór de fire-and-forget cache-write. Verschillen de
// twee (of is er niet te lezen): write overslaan — de retrieval draaide dan op
// een KB-snapshot van vóór een purge en zou de zojuist geleegde cache
// herbevuilen met een verouderd antwoord. Fail-closed is veilig: de cache is
// volledig regenereerbaar, een geskipte write kost alleen een toekomstige hit.
//
// Bewust een eigen klein module (niet in run-rag-query.ts): unit-testbaar
// zonder de hele engine te importeren. Vereist een service-role client —
// answer_cache_epoch heeft RLS aan zonder policies.
import type { SupabaseClient } from '@supabase/supabase-js';

/** Epoch van een org; 0 = nog nooit gepurged (geen rij); null = niet leesbaar. */
export async function readCacheEpoch(
  client: SupabaseClient,
  organizationId: string,
): Promise<number | null> {
  try {
    const { data, error } = await client
      .from('answer_cache_epoch')
      .select('epoch')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) return null;
    return (data?.epoch as number | undefined) ?? 0;
  } catch {
    return null;
  }
}

/** True → cache-write overslaan. Fail-closed: onleesbare epoch telt als skip. */
export function shouldSkipCacheWrite(
  epochAtStart: number | null,
  epochNow: number | null,
): boolean {
  return epochAtStart === null || epochNow === null || epochNow !== epochAtStart;
}
