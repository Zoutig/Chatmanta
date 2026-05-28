// Control Room — Klantenlijst (MD §7). Volledige tabel over alle tenant-orgs,
// gesorteerd op health (rood eerst). Elke rij linkt naar de klantdetailpagina.

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { StatusBadge } from '@/app/klantendashboard/components/status-badge';
import { getControlRoomKlanten } from '@/lib/controlroom/server/overview';
import { ONBOARDING_PHASE_LABELS } from '@/lib/controlroom/types';
import { formatCostUsd, formatRelativeNL } from '@/lib/controlroom/format';
import { CommercialBadge, HealthBadge, TechnicalBadge } from '../components/badges';

export const dynamic = 'force-dynamic';

const HEALTH_RANK = { red: 0, orange: 1, green: 2 } as const;

export default async function KlantenlijstPage() {
  const klanten = (await getControlRoomKlanten()).sort(
    (a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || a.name.localeCompare(b.name),
  );

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Klanten</h1>
          <p className="klant-page-sub">
            Alle tenant-orgs met commerciële + technische status, health en activiteit. Klik een
            klant voor het volledige detail.
          </p>
        </div>
      </header>

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
                <th>Gesprekken 7d</th>
                <th>Fallback</th>
                <th>Laatste activiteit</th>
                <th>Kosten/mnd</th>
              </tr>
            </thead>
            <tbody>
              {klanten.map((k) => (
                <tr key={k.slug}>
                  <td>
                    <Link
                      href={`/controlroom/klanten/${k.slug}`}
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
                  <td style={{ fontSize: 13 }}>{formatCostUsd(k.monthCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
