// V1 admin — klantenlijst, V0-pariteit. Gebruikt getControlRoomKlanten() uit
// lib/v1/admin/overview (gooit AUTH_FORBIDDEN door → opvangen hier).
// Link-target = orgId (UUID), niet slug — V1 detail-route gebruikt UUID.

import Link from 'next/link';
import { isAppError } from '@/lib/errors/app-error';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { StatusBadge } from '@/app/klantendashboard/components/status-badge';
import { CommercialBadge, HealthBadge, TechnicalBadge } from '@/app/admindashboard/components/badges';
import { getControlRoomKlanten } from '@/lib/v1/admin/overview';
import { ONBOARDING_PHASE_LABELS } from '@/lib/controlroom/types';
import { formatRelativeNL } from '@/lib/controlroom/format';

export const dynamic = 'force-dynamic';

const HEALTH_RANK = { red: 0, orange: 1, green: 2 } as const;

export default async function OrganizationsPage() {
  let klanten;
  try {
    // getControlRoomKlanten roept intern getJorionAdminClient() aan — gooit
    // AUTH_FORBIDDEN als de sessie geen Jorion-admin is.
    klanten = (await getControlRoomKlanten()).sort(
      (a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || a.name.localeCompare(b.name),
    );
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }

  return (
    <>
      <PageHead
        title="Klanten"
        subtitle="Alle tenant-orgs met commerciële + technische status, health en activiteit."
        actions={
          <Link href="/v1/admin/organizations/new" className="klant-btn" data-variant="primary">
            + Nieuwe klant
          </Link>
        }
      />

      <Card padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Commercieel</th>
                <th>Technisch</th>
                <th>Health</th>
                <th>Widget</th>
                <th>Onboarding</th>
                <th>Gesprekken (wk)</th>
                <th>Fallback</th>
                <th>Laatste activiteit</th>
                <th>Kosten/mnd</th>
              </tr>
            </thead>
            <tbody>
              {klanten.map((k) => (
                <tr key={k.orgId}>
                  <td>
                    {/* V1: link naar UUID-gebaseerde detail-route, niet slug */}
                    <Link
                      href={`/v1/admin/organizations/${k.orgId}`}
                      style={{ textDecoration: 'none', color: 'var(--klant-ink)' }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{k.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--klant-dim)' }}>
                        {k.profile.customerOwner} · {k.profile.technicalOwner}
                      </div>
                    </Link>
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
                    <StatusBadge kind="widget" status={k.widgetStatus} />
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>
                    {ONBOARDING_PHASE_LABELS[k.profile.onboardingPhase]}
                  </td>
                  <td style={{ fontSize: 13 }}>{k.conversationsThisWeek}</td>
                  <td style={{ fontSize: 13 }}>
                    {k.fallbackPct == null ? '—' : `${k.fallbackPct}%`}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>
                    {formatRelativeNL(k.lastActivityAt)}
                  </td>
                  {/* V1 factureert in EUR (monthCostEur), niet USD */}
                  <td style={{ fontSize: 13 }}>
                    {`€${k.monthCostEur.toFixed(k.monthCostEur < 1 ? 3 : 2)}`}
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
