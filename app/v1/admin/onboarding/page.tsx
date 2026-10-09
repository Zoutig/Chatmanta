// V1 Admin — Onboarding-overzicht.
//
//   - Klanten uit getControlRoomKlanten() (V1 overview).
//   - admin_onboarding_items batch-gelezen (IN-query over alle org-ids) i.p.v. per
//     org: geen N+1 en geen auto-seed op een read-only overzichtspagina.
//   - admin-client via getJorionAdminClient() (V1 service-role, na requireJorionAdmin).

import Link from 'next/link';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getControlRoomKlanten } from '@/lib/v1/admin/overview';
import { ONBOARDING_PHASE_LABELS } from '@/lib/controlroom/types';
import { isAppError } from '@/lib/errors/app-error';
import type { OnboardingItemStatus } from '@/lib/controlroom/types';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Badge, EmptyState } from '@/app/v1/_ui/feedback';
import { DataTable, NumCell } from '../_ui/data-table';
import { ReloadButton } from '../_ui/reload-button';

export const dynamic = 'force-dynamic';

type ItemRow = { organization_id: string; status: string };

export default async function V1OnboardingPage() {
  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e;
  }

  const klanten = await getControlRoomKlanten();

  // Batch-read: alle onboarding-items over alle orgs in één query.
  const { data: itemData } =
    klanten.length > 0
      ? await admin
          .from('admin_onboarding_items')
          .select('organization_id, status')
          .in(
            'organization_id',
            klanten.map((k) => k.orgId),
          )
      : { data: [] as ItemRow[] };

  // Aggregeer per org: totaal, klaar, geblokkeerd.
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

  // Niet-afgeronde klanten eerst.
  rows.sort(
    (a, b) =>
      Number(a.k.profile.onboardingPhase === 'completed') - Number(b.k.profile.onboardingPhase === 'completed'),
  );

  return (
    <div className="v1-page">
      <PageHeader
        title="Onboarding"
        description="Fase, eigenaar, voortgang en volgende actie van elke klant in onboarding."
        actions={<ReloadButton />}
      />

      <section className="v1-card">
        {rows.length === 0 ? (
          <EmptyState>Nog geen klanten.</EmptyState>
        ) : (
          <DataTable
            label="Onboarding per klant"
            columns={[
              { label: 'Klant' },
              { label: 'Fase' },
              { label: 'Eigenaar' },
              { label: 'Voortgang', num: true },
              { label: 'Geblokkeerd' },
              { label: 'Volgende actie' },
            ]}
          >
            {rows.map(({ k, total, done, blocked }) => (
              <tr key={k.orgId}>
                <td>
                  <Link href={`/v1/admin/organizations/${k.orgId}`} className="v1-adm-clip">
                    {k.name}
                  </Link>
                </td>
                <td>
                  {k.profile.onboardingPhase === 'completed' ? (
                    <Badge tone="ok" dot>
                      Afgerond
                    </Badge>
                  ) : (
                    <span className="v1-adm-muted">{ONBOARDING_PHASE_LABELS[k.profile.onboardingPhase]}</span>
                  )}
                </td>
                <td className="v1-adm-muted">{k.profile.customerOwner || 'Geen'}</td>
                <NumCell>{total > 0 ? `${done} van ${total}` : 'Geen stappen'}</NumCell>
                <td>
                  {blocked > 0 ? (
                    <Badge tone="danger" dot>
                      {blocked}
                    </Badge>
                  ) : (
                    <span className="v1-adm-muted">Geen</span>
                  )}
                </td>
                <td className="v1-adm-muted">
                  <span className="v1-adm-clip">{k.profile.nextAction ?? 'Geen'}</span>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}
