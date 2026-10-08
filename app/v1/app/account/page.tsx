// V1 Account: e-mail/wachtwoord (Supabase Auth) + organisatienaam (owner-only)
// + verbruiksmetrics (gesprekken deze maand + documenten) via session-client RLS.
//
// E-mail komt uit de SESSIE (user.email), niet uit public.users — die mirror kan
// driften na een e-mailwijziging (geen sync-trigger). Org-naam + rol onder de
// session-client (RLS: organizations_select_own + organization_members_select_own).
// query_log en documents hebben elk een SELECT-policy voor org-leden (0002).

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { checkOrgMonthlyLimit, checkOrgDailyBudget } from '@/lib/v1/limits/usage-limits';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { AccountForm } from './account-form';

export const dynamic = 'force-dynamic';

export default async function V1AccountPage() {
  let session: Awaited<ReturnType<typeof getSessionOrg>>;
  try {
    session = await getSessionOrg();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Je bent geen lid van deze organisatie." />;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }
  const { user, orgId } = session;

  const supabase = await createClient();

  // Verbruik-inzicht hergebruikt de bestaande limiet-checks (zelfde functies als
  // de chat-gates) — geen nieuwe berekening. Beide accepteren elke SupabaseClient;
  // de RLS-policies op organizations/query_log staan een org-lid dit al toe
  // (zie ook de org-naam-select hieronder, die dezelfde policy gebruikt).
  const [{ data: org }, { data: membership }, monthly, dailyBudget, { count: docCount }] =
    await Promise.all([
      supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
      supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', user.id)
        .maybeSingle(),
      checkOrgMonthlyLimit(supabase, orgId),
      checkOrgDailyBudget(supabase, orgId),
      supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .is('deleted_at', null),
    ]);

  return (
    <div className="v1-page v1-page--narrow">
      <PageHeader
        title="Account"
        description="Je inloggegevens, je organisatie en wat je deze maand hebt verbruikt."
      />
      <AccountForm
        email={user.email ?? ''}
        orgName={(org?.name as string | undefined) ?? ''}
        isOwner={membership?.role === 'owner'}
        orgId={orgId}
        monthly={monthly}
        dailyBudget={dailyBudget}
        documentsCount={docCount ?? 0}
      />
    </div>
  );
}
