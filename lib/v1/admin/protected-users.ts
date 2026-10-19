// Bescherming tegen het wissen van een Jorion-admin-account bij het verwijderen van
// een lid of een organisatie (security-audit 2026-10, laag-lijst).
//
// adminRemoveMemberAction en deleteOrgDataAction ruimen best-effort de auth-user op
// als die nergens anders lid is. Is die user een Jorion-admin (bijvoorbeeld een
// collega-admin die ook lid van de klant-org was), dan zou zijn account verdwijnen.
// Deze check houdt dat tegen. Fail-closed: bij een leesfout of onduidelijk antwoord
// geldt de user als beschermd (niet wissen); een achtergebleven account is te
// herstellen, een gewist admin-account niet.

import type { SupabaseClient } from '@supabase/supabase-js';

/** true = deze auth-user NIET verwijderen (Jorion-admin of status onbekend). */
export async function isProtectedAdminUser(svc: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await svc
      .from('users')
      .select('is_jorion_admin')
      .eq('id', userId)
      .maybeSingle();
    if (error) return true;
    return (data as { is_jorion_admin?: unknown } | null)?.is_jorion_admin === true;
  } catch {
    return true;
  }
}
