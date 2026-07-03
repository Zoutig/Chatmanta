// V1 admin-config — globale operator-instellingen (key/value).
//
// Port van lib/v0/server/admin-config.ts. Eerste gebruik: FAQ-refresh-cadans
// (weekly|monthly), gelezen door de V1 FAQ-cron om de staleness-drempel te
// bepalen.
//
// ⚠️ admin_config heeft RLS AAN, GEEN policy (migr 0018) — uitsluitend
// toegankelijk via service-role. We gebruiken getV1ServiceRoleClient()
// ZONDER requireJorionAdmin(), zodat de cron (zonder user-sessie) ook kan
// lezen. De auth-gate zit in de server action (set-faq-cadence-action.ts),
// niet hier.

import 'server-only';

import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';

// ---------------------------------------------------------------------------
// FAQ-refresh-cadans
// ---------------------------------------------------------------------------

export type FaqRefreshCadence = 'weekly' | 'monthly';

const FAQ_CADENCE_KEY = 'faq_refresh_cadence';
const DEFAULT_FAQ_CADENCE: FaqRefreshCadence = 'weekly';

function isCadence(v: unknown): v is FaqRefreshCadence {
  return v === 'weekly' || v === 'monthly';
}

/**
 * Lees de FAQ-refresh-cadans uit admin_config. Default 'weekly' als de key
 * ontbreekt, ongeldig is, of de tabel nog niet bestaat (migratie 0018 niet
 * toegepast). Gooit nooit — de cron moet altijd een drempel hebben.
 */
export async function getFaqRefreshCadence(): Promise<FaqRefreshCadence> {
  try {
    const { data, error } = await getV1ServiceRoleClient()
      .from('admin_config')
      .select('value')
      .eq('key', FAQ_CADENCE_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_FAQ_CADENCE;
    // value is jsonb — bij een string-cadans krijgen we de plain string terug.
    const v = (data as { value: unknown }).value;
    return isCadence(v) ? v : DEFAULT_FAQ_CADENCE;
  } catch {
    return DEFAULT_FAQ_CADENCE;
  }
}

/**
 * Schrijf (upsert) de FAQ-refresh-cadans. Bedoeld voor de operator-UI
 * achter requireJorionAdmin() in de server action. Throwt bij een echte
 * DB-fout zodat de action het kan rapporteren.
 */
export async function setFaqRefreshCadence(cadence: FaqRefreshCadence): Promise<void> {
  if (!isCadence(cadence)) {
    throw new Error(`ongeldige FAQ-cadans: ${String(cadence)}`);
  }
  const { error } = await getV1ServiceRoleClient()
    .from('admin_config')
    .upsert({ key: FAQ_CADENCE_KEY, value: cadence }, { onConflict: 'key' });
  if (error) throw new Error(`admin_config upsert: ${error.message}`);
}
