// Raw V0 service-role Supabase client factory — bypasses ALL Row-Level Security.
//
// Deliberately has ZERO dependency on `@/lib/auth` (and thus on next/navigation
// / next/headers). That keeps it importable from:
//   - tsx/CLI tools run with `--conditions=react-server` (eval, audits, and the
//     retrieval pipeline in rag.ts that those tools import) — importing the auth
//     layer there crashes with "React.createContext is not a function".
//   - modules transitively reachable from client components (e.g.
//     lib/v0/crawler/credit-log.ts ← firecrawl.ts ← kennisbank UI). The key is
//     read at runtime only (not NEXT_PUBLIC) so it is stripped from the client
//     bundle and the factory is effectively a no-op there.
//
// This is the SINGLE place in the app that reads V0_SUPABASE_SERVICE_ROLE_KEY to
// build a client. The V0/V1-namespace-split (kickoff §3) splits the factory per
// database: this is the V0 factory (V0_* env); the V1 counterpart lives in
// lib/supabase/v1/service-role.ts (V1_* env).
//
// NOTE: this factory does NO authorization — V0 does not enforce SA-5 (zie de
// V0-sandbox-disclaimer in AGENTS.md). For request-context code that must gate
// access first, use the wrappers in `./admin.ts`
// (getJorionAdminClient / getOrgScopedAdminClient / getSystemJobClient), which
// delegate to this same factory after their auth check.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _cached: SupabaseClient | null = null;

/**
 * Lazy-cached service-role client. Synchroon (geen await) zodat de bestaande
 * synchrone call-sites (`getServiceRoleClient().from(...)`) niet async hoeven te
 * worden. Opties identiek aan de oude lokale fabrieken (geen sessie-persistentie).
 */
export function getServiceRoleClient(): SupabaseClient {
  if (_cached) return _cached;
  const url = process.env.V0_SUPABASE_URL;
  const key = process.env.V0_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'V0 service-role client requires V0_SUPABASE_URL and V0_SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  _cached = createClient(url, key, {
    auth: {
      // No session persistence — service-role acts as a system identity,
      // not a logged-in user.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _cached;
}
