// Service-role Supabase client — bypasses ALL Row-Level Security policies.
//
// SECURITY (Blueprint Security Addendum SA-5):
// The raw service-role client must NEVER be exported or imported directly
// outside this module. All consumers must go through the wrapper functions
// below, which enforce an explicit authorization check before handing out
// the privileged client.
//
// Code review rule: a `grep` for `_serviceRoleClient` outside this file is
// a security bug. Use the named wrappers — pick the one whose precondition
// matches the caller's context.
//
// Do NOT use these wrappers for ordinary user-scoped queries. Use
// `lib/supabase/server.ts` (RLS-bound) instead, and reach for service-role
// only when you genuinely need to bypass RLS (system jobs, cross-org admin
// reads, batch cleanup).

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireJorionAdmin, requireOrgMember } from '@/lib/auth';

let _cached: SupabaseClient | null = null;

function _serviceRoleClient(): SupabaseClient {
  if (_cached) return _cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Service-role client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  _cached = createSupabaseClient(url, key, {
    auth: {
      // No session persistence — service-role acts as a system identity,
      // not a logged-in user.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _cached;
}

/**
 * Service-role client for routes that require Jorion-admin access (the
 * /admin/* dashboard and admin-only server actions). Verifies
 * `users.is_jorion_admin = true` on the calling user before returning.
 */
export async function getJorionAdminClient(): Promise<SupabaseClient> {
  await requireJorionAdmin();
  return _serviceRoleClient();
}

/**
 * Service-role client for org-scoped operations the calling user is
 * authorized to perform (e.g., uploading a document into THEIR org's bucket
 * after a `requireOrgMember` check). Verifies membership before returning.
 *
 * After receiving the client, the caller MUST scope all writes to `orgId`
 * (e.g., `WHERE organization_id = orgId`). Wrapper does not enforce this —
 * it cannot — so blueprint sectie 11 says: filter explicitly.
 */
export async function getOrgScopedAdminClient(orgId: string): Promise<SupabaseClient> {
  await requireOrgMember(orgId);
  return _serviceRoleClient();
}

/**
 * Service-role client for system jobs (Vercel Cron, background processing
 * jobs invoked via `waitUntil()`). Caller is responsible for having
 * validated the trust boundary (e.g., CRON_SECRET in the route handler)
 * BEFORE calling this — there is no per-user session to verify here.
 *
 * The `reason` argument is logged for audit purposes; choose a stable
 * short string ('cleanup', 'process_document', 'crawl_website', etc.).
 */
export async function getSystemJobClient(opts: { reason: string }): Promise<SupabaseClient> {
  if (!opts?.reason) {
    throw new Error('getSystemJobClient requires a reason string for audit');
  }
  // Light audit trail. Replace with structured logger later (Fase 7).
  // Intentionally not using requireJorionAdmin/requireOrgMember here —
  // system jobs run without a user session.
  console.log(`[admin] getSystemJobClient invoked: reason=${opts.reason}`);
  return _serviceRoleClient();
}

/**
 * Service-role client voor interne (V0-)modules die al binnen een vertrouwde
 * grens draaien — geen per-request user-identiteit — en die vóór PR-2 elk hun
 * eigen `createClient(...SERVICE_ROLE_KEY...)` bouwden. Gedrag-identiek aan die
 * lokale fabrieken: lazy-cached, geen sessie-persistentie, GEEN auth-check.
 *
 * Anders dan getJorionAdminClient/getOrgScopedAdminClient doet deze GEEN
 * autorisatie — het is bewust de consolidatie-bestemming voor code die er geen
 * had (V0 handhaaft SA-5 niet; zie AGENTS.md V0-sandbox-disclaimer). Het
 * bestaansrecht: er is nu ÉÉN plek die SUPABASE_SERVICE_ROLE_KEY leest, die de
 * latere V0/V1-namespace-split (kickoff-spec §3) in tweeën kan knippen i.p.v.
 * opnieuw ~27 bestanden te moeten bewerken.
 *
 * Synchroon (geen await) zodat de bestaande synchrone call-sites
 * (`sb().from(...)`) niet async hoeven te worden.
 */
export function getServiceRoleClient(): SupabaseClient {
  return _serviceRoleClient();
}
