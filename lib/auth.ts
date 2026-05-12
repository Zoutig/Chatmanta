import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors/app-error';

// Auth helpers for server-side route protection. Use these at the top of
// every Server Component, Server Action, and Route Handler that needs an
// authenticated user.
//
// These helpers read the user's session from cookies (via `lib/supabase/server.ts`)
// — subject to RLS, no service-role bypass. For privileged service-role work
// after these checks pass, use the wrappers in `lib/supabase/admin.ts`.

/**
 * Require the request to come from an authenticated user.
 * Redirects to /login if not authenticated.
 */
export async function requireAuth(): Promise<User> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
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
