// Auth-gated service-role wrappers — see ./service-role.ts (V0) and
// ./v1/service-role.ts (V1) for the raw factories.
//
// SECURITY (Blueprint Security Addendum SA-5):
// These wrappers enforce an explicit authorization check before handing out the
// privileged (RLS-bypassing) service-role client. Use them from request-context
// code (Server Components, Server Actions, Route Handlers) that must verify the
// caller first.
//
// DELIBERATE V0/V1 MIX (kickoff §3): the two user-auth-gated wrappers
// (getJorionAdminClient / getOrgScopedAdminClient) run behind the V1 auth layer
// (requireJorionAdmin / requireOrgMember → V1 session) and therefore return the
// V1 service-role client (getV1ServiceRoleClient). getSystemJobClient runs
// without a user session for V0 cron/background jobs and stays on the V0 factory
// (getServiceRoleClient). This split is intentional — do not unify them.
//
// The raw clients live in ./service-role.ts / ./v1/service-role.ts so they can
// be imported by tsx scripts and client-reachable modules WITHOUT dragging in
// @/lib/auth → next/navigation / next/headers. Keep this file's @/lib/auth
// import confined to the request-context wrappers below; do not let the raw
// factories re-couple to that chain.
//
// Do NOT use these wrappers for ordinary user-scoped queries. Use
// `lib/supabase/v1/server.ts` (RLS-bound) instead, and reach for service-role
// only when you genuinely need to bypass RLS (system jobs, cross-org admin
// reads, batch cleanup).

import { type SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleClient } from './service-role';            // V0
import { getV1ServiceRoleClient } from './v1/service-role';        // V1
import { requireJorionAdmin, requireOrgMember } from '@/lib/auth';

/**
 * Service-role client for routes that require Jorion-admin access (the
 * /admin/* dashboard and admin-only server actions). Verifies
 * `users.is_jorion_admin = true` on the calling user before returning.
 */
export async function getJorionAdminClient(): Promise<SupabaseClient> {
  await requireJorionAdmin();
  return getV1ServiceRoleClient();
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
  return getV1ServiceRoleClient();
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
  return getServiceRoleClient();
}
