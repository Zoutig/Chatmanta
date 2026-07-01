// V1 Account — e-mail/wachtwoord (Supabase Auth) + organisatienaam (owner-only)
// + verbruiksmetrics (gesprekken deze maand + documenten) via session-client RLS.
//
// E-mail komt uit de SESSIE (user.email), niet uit public.users — die mirror kan
// driften na een e-mailwijziging (geen sync-trigger). Org-naam + rol onder de
// session-client (RLS: organizations_select_own + organization_members_select_own).
// query_log en documents hebben elk een SELECT-policy voor org-leden (0002).

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { AccountForm } from './account-form';

export const dynamic = 'force-dynamic';

export default async function V1AccountPage() {
  let session: Awaited<ReturnType<typeof getSessionOrg>>;
  try {
    session = await getSessionOrg();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead eyebrow="Account" title="Geen toegang" subtitle="Je bent geen lid van deze organisatie." />
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }
  const { user, orgId } = session;

  const supabase = await createClient();
  // Start van de huidige kalendermaand (lokale middernacht in UTC-formaat is
  // goed genoeg voor de tellerweergave — exactheid op maandgrens is geen hard requirement).
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [{ data: org }, { data: membership }, { count: convCount }, { count: docCount }] =
    await Promise.all([
      supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
      supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('query_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', startOfMonth),
      supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .is('deleted_at', null),
    ]);

  return (
    <>
      <PageHead
        eyebrow="Account"
        title="Jouw account en workspace"
        subtitle="Beheer je inloggegevens en de naam van je organisatie."
      />
      <AccountForm
        email={user.email ?? ''}
        orgName={(org?.name as string | undefined) ?? ''}
        isOwner={membership?.role === 'owner'}
        orgId={orgId}
        conversationsThisMonth={convCount ?? 0}
        documentsCount={docCount ?? 0}
      />
    </>
  );
}
