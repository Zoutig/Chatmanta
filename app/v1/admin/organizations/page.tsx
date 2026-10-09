// V1 admin — Klanten. Gebruikt getControlRoomKlanten() uit lib/v1/admin/overview
// (gooit AUTH_FORBIDDEN door → opvangen hier). Link-target = orgId (UUID).

import Link from 'next/link';
import { isAppError } from '@/lib/errors/app-error';
import { getControlRoomKlanten } from '@/lib/v1/admin/overview';
import { ONBOARDING_PHASE_LABELS } from '@/lib/controlroom/types';
import { formatRelativeNL } from '@/lib/controlroom/format';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { EmptyState } from '@/app/v1/_ui/feedback';
import { DataTable, NumCell } from '../_ui/data-table';
import { CommercialBadge, HealthBadge, TechnicalBadge, WidgetBadge } from '../_ui/status-badges';
import { formatEur } from '../_ui/format';

export const dynamic = 'force-dynamic';

const HEALTH_RANK = { red: 0, orange: 1, green: 2 } as const;

export default async function OrganizationsPage() {
  let klanten;
  try {
    // getControlRoomKlanten roept intern getJorionAdminClient() aan.
    klanten = (await getControlRoomKlanten()).sort(
      (a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || a.name.localeCompare(b.name),
    );
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }

  return (
    <div className="v1-page">
      <PageHeader
        title="Klanten"
        description="Alle klanten met commerciële en technische status, gezondheid en activiteit."
        actions={
          <Link href="/v1/admin/organizations/new" className={buttonClass()}>
            Nieuwe klant
          </Link>
        }
      />

      <section className="v1-card">
        {klanten.length === 0 ? (
          <EmptyState>Nog geen klanten.</EmptyState>
        ) : (
          <DataTable
            label="Klanten"
            columns={[
              { label: 'Klant' },
              { label: 'Commercieel' },
              { label: 'Technisch' },
              { label: 'Gezondheid' },
              { label: 'Widget' },
              { label: 'Onboarding' },
              { label: 'Gesprekken (week)', num: true },
              { label: 'Niet beantwoord', num: true },
              { label: 'Laatste activiteit' },
              { label: 'Kosten (maand)', num: true },
            ]}
          >
            {klanten.map((k) => (
              <tr key={k.orgId}>
                <td>
                  <Link href={`/v1/admin/organizations/${k.orgId}`} className="v1-adm-clip">
                    {k.name}
                  </Link>
                  <span className="v1-adm-muted v1-adm-clip">
                    {[k.profile.customerOwner, k.profile.technicalOwner].filter(Boolean).join(', ') || 'Geen eigenaar'}
                  </span>
                </td>
                <td>
                  <CommercialBadge status={k.commercialStatus} />
                </td>
                <td>
                  <TechnicalBadge status={k.technicalStatus} />
                </td>
                <td>
                  <HealthBadge status={k.health} />
                </td>
                <td>
                  <WidgetBadge status={k.widgetStatus} />
                </td>
                <td className="v1-adm-muted">{ONBOARDING_PHASE_LABELS[k.profile.onboardingPhase]}</td>
                <NumCell>{k.conversationsThisWeek}</NumCell>
                <NumCell>{k.fallbackPct == null ? 'Geen data' : `${k.fallbackPct}%`}</NumCell>
                <td className="v1-adm-muted">{formatRelativeNL(k.lastActivityAt)}</td>
                <NumCell>{formatEur(k.monthCostEur)}</NumCell>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}
