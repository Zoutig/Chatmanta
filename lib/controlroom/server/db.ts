// Control Room storage — service-role Supabase singleton.
//
// Volgt het cc_*-precedent (lib/commandcenter/server/storage.ts): een lokale
// service-role client, NIET de lib/supabase/admin.ts-wrappers — die vereisen de
// V1 auth-laag (requireJorionAdmin/requireOrgMember) die in V0 niet actief is.
// Geen RLS op admin_* tabellen (zie migration 0038 header); alle toegang loopt
// langs deze module, achter de proxy-gate + requireV0Auth() in de actions.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _sb: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Control Room storage requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}
