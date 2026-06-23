// V0 admin-config — globale operator-instellingen (key/value).
//
// Eerste gebruik: FAQ-refresh-cadans (weekly|monthly), gelezen door de FAQ-cron
// (app/api/v0/cron/faq-snapshot) om de staleness-drempel te bepalen.
//
// ⚠️ admin_config volgt het admin_*-RLS-OFF-precedent: founder-interne config,
// GEEN tenant-leespad. Schrijven loopt UITSLUITEND via een server action met
// requireV0Auth() + de service-role wrapper hieronder. Defensief op een nog
// niet-toegepaste migratie → val terug op de default.

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/admin';

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
 * ontbreekt, ongeldig is, of de tabel nog niet bestaat (migratie niet
 * toegepast). Nooit throwen — de cron moet altijd een drempel hebben.
 */
export async function getFaqRefreshCadence(): Promise<FaqRefreshCadence> {
  try {
    const { data, error } = await getServiceRoleClient()
      .from('admin_config')
      .select('value')
      .eq('key', FAQ_CADENCE_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_FAQ_CADENCE;
    // value is jsonb — bij een string-cadans krijgen we hier de plain string.
    const v = (data as { value: unknown }).value;
    return isCadence(v) ? v : DEFAULT_FAQ_CADENCE;
  } catch {
    return DEFAULT_FAQ_CADENCE;
  }
}

/**
 * Schrijf (upsert) de FAQ-refresh-cadans. Bedoeld voor de operator-UI (M5),
 * achter requireV0Auth() in de server action. Throwt bij een echte DB-fout
 * zodat de actie 'm kan rapporteren.
 */
export async function setFaqRefreshCadence(cadence: FaqRefreshCadence): Promise<void> {
  if (!isCadence(cadence)) {
    throw new Error(`invalid FAQ refresh cadence: ${String(cadence)}`);
  }
  const { error } = await getServiceRoleClient()
    .from('admin_config')
    .upsert(
      { key: FAQ_CADENCE_KEY, value: cadence },
      { onConflict: 'key' },
    );
  if (error) throw new Error(`admin_config upsert: ${error.message}`);
}
