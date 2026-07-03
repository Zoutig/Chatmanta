// V1 Admin — Onboarding-overzicht. Port van app/admindashboard/onboarding/page.tsx.
//
// Verschillen t.o.v. V0:
//   - Geen KNOWN_ORGS: klanten komen uit getControlRoomKlanten() (V1 overview).
//   - admin_onboarding_items direct batch-gelezen (IN-query over alle org-ids)
//     in plaats van per-org via listOnboardingItems — voorkomt N+1 én auto-seed
//     side-effect op een read-only overzichtspagina.
//   - admin-client via getJorionAdminClient() (V1 service-role, na requireJorionAdmin).

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill } from '@/app/klantendashboard/components/ui/pill';
import { ReloadButton } from '@/app/admindashboard/components/reload-button';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getControlRoomKlanten } from '@/lib/v1/admin/overview';
import { ONBOARDING_PHASE_LABELS } from '@/lib/controlroom/types';
import { isAppError } from '@/lib/errors/app-error';
import type { OnboardingItemStatus } from '@/lib/controlroom/types';

export const dynamic = 'force-dynamic';

type ItemRow = { organization_id: string; status: string };

export default async function V1OnboardingPage() {
  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
    }
    throw e;
  }

  // getControlRoomKlanten roept zelf getJorionAdminClient() aan; dubbele auth-check
  // is benign. Parallel met de onboarding-items-batch-query.
  const klanten = await getControlRoomKlanten();

  // Batch-read: alle onboarding-items over alle orgs in één query (geen N+1, geen auto-seed).
  const { data: itemData } = klanten.length > 0
    ? await admin
        .from('admin_onboarding_items')
        .select('organization_id, status')
        .in('organization_id', klanten.map((k) => k.orgId))
    : { data: [] as ItemRow[] };

  // Aggregeer per org: totaal, done, blocked.
  const statsMap = new Map<string, { total: number; done: number; blocked: number }>();
  for (const r of (itemData ?? []) as ItemRow[]) {
    const s = statsMap.get(r.organization_id) ?? { total: 0, done: 0, blocked: 0 };
    s.total += 1;
    if ((r.status as OnboardingItemStatus) === 'done') s.done += 1;
    if ((r.status as OnboardingItemStatus) === 'blocked') s.blocked += 1;
    statsMap.set(r.organization_id, s);
  }

  const rows = klanten.map((k) => ({
    k,
    ...(statsMap.get(k.orgId) ?? { total: 0, done: 0, blocked: 0 }),
  }));

  // Niet-afgeronde klanten eerst (spiegelt V0-sort).
  rows.sort(
    (a, b) =>
      Number(a.k.profile.onboardingPhase === 'completed') -
      Number(b.k.profile.onboardingPhase === 'completed'),
  );

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Onboarding</h1>
          <p className="klant-page-sub">
            Alle klanten in onboarding: fase, eigenaar, voortgang, geblokkeerde stappen en de
            volgende actie.
          </p>
        </div>
        <ReloadButton />
      </header>

      <Card padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Fase</th>
                <th>Owner</th>
                <th>Voortgang</th>
                <th>Geblokkeerd</th>
                <th>Volgende actie</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ k, total, done, blocked }) => (
                <tr key={k.slug}>
                  <td>
                    <Link
                      href={`/v1/admin/organizations/${k.orgId}`}
                      style={{
                        textDecoration: 'none',
                        color: 'var(--klant-ink)',
                        fontWeight: 600,
                        fontSize: 13.5,
                      }}
                    >
                      {k.name}
                    </Link>
                  </td>
                  <td>
                    {k.profile.onboardingPhase === 'completed' ? (
                      <Pill tone="success" dot>
                        Afgerond
                      </Pill>
                    ) : (
                      <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>
                        {ONBOARDING_PHASE_LABELS[k.profile.onboardingPhase]}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>
                    {k.profile.customerOwner}
                  </td>
                  <td style={{ fontSize: 13 }}>{total > 0 ? `${done}/${total}` : '—'}</td>
                  <td>
                    {blocked > 0 ? (
                      <Pill tone="danger" dot>
                        {blocked}
                      </Pill>
                    ) : (
                      <span style={{ color: 'var(--klant-faint)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td
                    style={{
                      fontSize: 12.5,
                      color: 'var(--klant-muted)',
                      maxWidth: 280,
                    }}
                  >
                    {k.profile.nextAction ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
