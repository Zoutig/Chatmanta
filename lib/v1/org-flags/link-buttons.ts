// Per-org Linkknoppen (migr V1 0031, organizations.link_buttons_enabled, 2026-10-14).
// Aan = de bot mag links geven, maar alleen als de bezoeker om een document,
// download of plek op de site vraagt; de widget toont ze als knop. Uit (default)
// = hard rule 9: geen links in V1.
//
// Eigen read, net als lib/v1/limits/fast-mode.ts: zolang migr 0031 niet op een
// omgeving staat, mag een ontbrekende kolom nooit een bestaande select (embed-load,
// chat-gate) laten falen. Elke fout → false (links uit = de veilige kant).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RagConfig } from '@/lib/rag/types';

/** true = Linkknoppen aan. Fout/geen rij/ontbrekende kolom → false. */
export async function getOrgLinkButtons(client: SupabaseClient, orgId: string): Promise<boolean> {
  try {
    const { data, error } = await client
      .from('organizations')
      .select('link_buttons_enabled')
      .eq('id', orgId)
      .maybeSingle();
    if (error) throw error;
    return (data as { link_buttons_enabled?: boolean | null } | null)?.link_buttons_enabled === true;
  } catch (err) {
    console.error(
      '[link-buttons] organizations-read faalde (→ links uit):',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/**
 * Laatste stap op elke V1-chatconfig (widget én dashboard-preview delen de
 * answer-cache, dus ze moeten exact dezelfde link-instelling draaien).
 * Uit → sourceLinksEnabled false, ongeacht wat eerder in de config stond.
 */
export function applyLinkButtons<T extends RagConfig>(config: T, enabled: boolean): T {
  if (!enabled) return { ...config, sourceLinksEnabled: false, sourceLinksMode: undefined };
  return { ...config, sourceLinksEnabled: true, sourceLinksMode: 'on-request' };
}
