// V1-prod service-role factory — bypasses RLS, reads V1_* env. Zelfde vorm als
// de V0-factory (lib/supabase/service-role.ts) maar tegen het V1-project. Zero
// dependency op @/lib/auth (zie service-role.ts voor het waarom).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _cached: SupabaseClient | null = null;

export function getV1ServiceRoleClient(): SupabaseClient {
  if (_cached) return _cached;
  const url = process.env.NEXT_PUBLIC_V1_SUPABASE_URL;
  const key = process.env.V1_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'V1 service-role client requires NEXT_PUBLIC_V1_SUPABASE_URL and V1_SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  _cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _cached;
}
