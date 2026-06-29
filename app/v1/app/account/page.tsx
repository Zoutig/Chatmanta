// V1 Account — e-mail/wachtwoord (Supabase Auth) + organisatienaam (owner-only).
//
// E-mail komt uit de SESSIE (user.email), niet uit public.users — die mirror kan
// driften na een e-mailwijziging (geen sync-trigger). Org-naam + rol onder de
// session-client (RLS: organizations_select_own + organization_members_select_own).

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { AccountForm } from './account-form';

export const dynamic = 'force-dynamic';

const SHELL = { maxWidth: 640, margin: '8vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' } as const;

export default async function V1AccountPage() {
  let session: Awaited<ReturnType<typeof getSessionOrg>>;
  try {
    session = await getSessionOrg();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <main style={SHELL}>
          <h1 style={{ fontSize: 20 }}>Geen toegang</h1>
          <p style={{ fontSize: 14, color: '#555' }}>Je bent geen lid van deze organisatie.</p>
        </main>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }
  const { user, orgId } = session;

  const supabase = await createClient();
  const [{ data: org }, { data: membership }] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
    supabase.from('organization_members').select('role').eq('organization_id', orgId).eq('user_id', user.id).maybeSingle(),
  ]);

  return (
    <main style={SHELL}>
      <h1 style={{ fontSize: 22 }}>Account</h1>
      <p style={{ fontSize: 14, color: '#555', marginBottom: 24 }}>
        Beheer je inloggegevens en de naam van je organisatie.
      </p>
      <AccountForm
        email={user.email ?? ''}
        orgName={(org?.name as string | undefined) ?? ''}
        isOwner={membership?.role === 'owner'}
      />
    </main>
  );
}
