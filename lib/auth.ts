import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/v1/server';
import type { User } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors/app-error';

// Auth helpers for server-side route protection. Use these at the top of
// every Server Component, Server Action, and Route Handler that needs an
// authenticated user.
//
// These helpers read the user's session from cookies (via `lib/supabase/v1/server.ts`)
// — subject to RLS, no service-role bypass. For privileged service-role work
// after these checks pass, use the auth-gated wrappers in `lib/supabase/admin.ts`;
// the underlying V1 service-role factory lives in `lib/supabase/v1/service-role.ts`.

/**
 * Require the request to come from an authenticated user.
 * Redirects to /v1/login if not authenticated.
 *
 * NB: dit is de V1-auth-laag (Supabase Auth tegen het V1-project). `/v1/login`
 * is de V1-login — NIET de V0-demo-wachtwoord-`/login`. De provisionele route
 * verandert mogelijk bij de kernel-graduatie.
 */
export async function requireAuth(): Promise<User> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v1/login');
  return user;
}

/**
 * Require the authenticated user to be a member of `orgId`.
 * Throws 403-equivalent if not. Redirects to /login if not authenticated.
 *
 * Returns the user. Caller can rely on RLS for org-scoped queries afterward,
 * but this gate is still required for service-role operations (anti-IDOR;
 * blueprint Security Addendum SA-1).
 */
export async function requireOrgMember(orgId: string): Promise<User> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL', { message: `Membership lookup failed: ${error.message}` });
  }
  if (!membership) {
    throw new AppError('AUTH_FORBIDDEN', { message: 'not a member of this organization' });
  }
  return user;
}

/**
 * Require the authenticated user to be a Jorion-admin (internal staff).
 * Used for /admin/* routes and admin server actions.
 *
 * Note: `is_jorion_admin = true` is set manually in Supabase Table Editor —
 * there is no UI to grant this role (blueprint sectie 20).
 */
export async function requireJorionAdmin(): Promise<User> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from('users')
    .select('is_jorion_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL', { message: `User lookup failed: ${error.message}` });
  }
  if (!profile?.is_jorion_admin) {
    throw new AppError('AUTH_FORBIDDEN', { message: 'Jorion-admin role required' });
  }
  return user;
}

/**
 * Resolve the org of the logged-in user from their single organization_members row
 * (blueprint §1.5 = één org per klant), read under the session-client (RLS).
 *
 * This replaces the provisional `process.env.V1_SEED_ORG_ID` in the /v1/app surface:
 * the dashboard org now comes from the authenticated session, never from env/client
 * (hard rule: org uit de getrouwde sessie).
 *
 * Throws (mirroring requireOrgMember, so existing catch-blocks keep working):
 *   - NEXT_REDIRECT (geen sessie) via requireAuth → caller lets it propagate to /v1/login
 *   - AppError('AUTH_FORBIDDEN') when the user is a member of no org → "geen toegang"
 *   - AppError('INTERNAL') on a DB/RLS hiccup
 */
export async function getSessionOrg(): Promise<{ user: User; orgId: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL', { message: `Org-resolutie faalde: ${error.message}` });
  }
  if (!data) {
    throw new AppError('AUTH_FORBIDDEN', { message: 'user is not a member of any organization' });
  }
  return { user, orgId: data.organization_id as string };
}
