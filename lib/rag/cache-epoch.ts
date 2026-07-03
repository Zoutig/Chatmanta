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
// zonder de hele engine te importeren.
//
// LET OP: de service-role client is load-bearing. answer_cache_epoch heeft RLS
// aan zonder policies; onder een session-client leest een SELECT gewoon 0 rijen
// (geen error) → epoch 0 aan beide kanten → de guard no-op't stil (fail-open).
// Dat lekt geen stale data — de cache-WRITE zelf faalt dan óók onder RLS — maar
// de fail-closed-garantie hieronder geldt alleen met een service-role client,
// precies wat cacheWriteClient in de engine altijd is.
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
