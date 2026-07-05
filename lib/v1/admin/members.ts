// V1 admin — ledenlijst van een organisatie voor de klant-deep-dive (Beheer-tab).
//
// Leest organization_members ⨝ users (e-mail + rol) via een INJECTED service-role
// client (Jorion-admin gate zit bij de caller — getJorionAdminClient). De
// "nog nooit ingelogd"-vlag komt uit auth.users.last_sign_in_at, dat NIET in
// public.users staat → per lid één admin.auth.admin.getUserById (bounded door het
// aantal leden, in de praktijk een handjevol). Parallel opgehaald.

import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminMember = {
  userId: string;
  email: string;
  fullName: string | null;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
  lastSignInAt: string | null;
  neverLoggedIn: boolean;
};

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

type MemberRow = {
  user_id: string;
  role: string;
  created_at: string;
  users: { email: string | null; full_name: string | null } | null;
};

export async function listOrgMembers(
  admin: SupabaseClient,
  orgId: string,
): Promise<AdminMember[]> {
  const { data, error } = await admin
    .from('organization_members')
    .select('user_id, role, created_at, users!inner(email, full_name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`ledenlijst laden faalde: ${error.message}`);

  const rows = (data ?? []) as unknown as MemberRow[];

  const members = await Promise.all(
    rows.map(async (r): Promise<AdminMember> => {
      // last_sign_in_at leeft alleen in auth.users (niet in public.users).
      let lastSignInAt: string | null = null;
      const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(r.user_id);
      if (!authErr) lastSignInAt = authUser.user?.last_sign_in_at ?? null;
      return {
        userId: r.user_id,
        email: r.users?.email ?? '(onbekend)',
        fullName: r.users?.full_name ?? null,
        role: (r.role as AdminMember['role']) ?? 'member',
        createdAt: r.created_at,
        lastSignInAt,
        neverLoggedIn: !lastSignInAt,
      };
    }),
  );

  return members.sort(
    (a, b) =>
      (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
