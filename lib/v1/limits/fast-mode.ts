// Per-org Fast mode (migr 0029, organizations.fast_mode_enabled). Fast mode = OpenAI
// `service_tier: priority` op de antwoord- én hulpstap-calls: ~2× sneller generen
// tegen ~2× het tokentarief. V1_RAG_DEFAULTS zet beide tiers standaard op 'priority';
// een Jorion-admin kan het per klant uitzetten in de Beheer-tab.
//
// Bewust een eigen read i.p.v. een extra kolom in checkOrgChatGates' select: zolang
// migr 0029 niet op een omgeving staat, zou die select falen en de suspend-check
// fail-open laten gaan. Deze read faalt los, en dan naar de GOEDKOPE kant (standaard
// tier) — een DB-hapering of ontbrekende kolom mag nooit stil 2× kosten opleveren.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RagConfig } from '@/lib/rag/types';

/** true = Fast mode aan. Fout/geen rij/ontbrekende kolom → false (standaard tier). */
export async function getOrgFastMode(serviceClient: SupabaseClient, orgId: string): Promise<boolean> {
  try {
    const { data, error } = await serviceClient
      .from('organizations')
      .select('fast_mode_enabled')
      .eq('id', orgId)
      .maybeSingle();
    if (error) throw error;
    return (data as { fast_mode_enabled?: boolean | null } | null)?.fast_mode_enabled === true;
  } catch (err) {
    console.error(
      '[fast-mode] organizations-read faalde (→ standaard tier):',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/** Uit → beide service-tiers weg (standaard verwerking). Aan → config ongewijzigd. */
export function applyFastMode<T extends RagConfig>(config: T, enabled: boolean): T {
  if (enabled) return config;
  return { ...config, chatServiceTier: undefined, auxServiceTier: undefined };
}
