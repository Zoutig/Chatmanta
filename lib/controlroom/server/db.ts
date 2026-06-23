// Control Room storage — service-role Supabase singleton.
//
// De service-role client komt sinds PR-2 uit de centrale factory
// getServiceRoleClient() in lib/supabase/service-role.ts (één plek die
// SUPABASE_SERVICE_ROLE_KEY leest). Gedrag-identiek aan de vorige lokale
// fabriek: lazy-cached, geen sessie-persistentie, GEEN auth-check — bewust,
// want admin_* tabellen hebben geen RLS (zie migration 0038 header) en alle
// toegang loopt langs deze module, achter de proxy-gate + requireV0Auth() in
// de actions.

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/service-role';

// Behoud de bestaande `sb()`-API voor consumers (bv. lib/v0/server/error-capture.ts).
export const sb = getServiceRoleClient;
