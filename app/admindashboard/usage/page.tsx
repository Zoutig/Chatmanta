// Admin Dashboard — Usage & Kosten (MD §16). Cross-org verbruik + geschatte kosten
// + maandlimiet-status. Leest dezelfde getControlRoomKlanten-aggregatie.

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { getControlRoomKlanten } from '@/lib/controlroom/server/overview';
import { usageLimitStatus, type UsageLimitTone } from '@/lib/controlroom/usage-limits';
import { formatCostUsd } from '@/lib/controlroom/format';
import { MetricCard } from '../components/metric-card';

export const dynamic = 'force-dynamic';

const TONE_TO_PILL: Record<UsageLimitTone, PillTone> = {
  ink: 'neutral',
  warn: 'warn',
  danger: 'danger',
  success: 'success',
};

export default async function UsagePage() {
  const klanten = await getControlRoomKlanten();
  const totalMonth = klanten.reduce((a, k) => a + k.conversationsThisMonth, 0);
  const totalWeek = klanten.reduce((a, k) => a + k.conversationsThisWeek, 0);
  const totalCost = klanten.reduce((a, k) => a + k.monthCostUsd, 0);

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Usage &amp; Kosten</h1>
          <p className="klant-page-sub">Verbruik en geschatte kosten per klant deze maand, met limietstatus.</p>
        </div>
      </header>

      <div className="klant-metrics-grid" style={{ marginBottom: 20 }}>
        <MetricCard label="Gesprekken (deze week)" value={totalWeek} />
        <MetricCard label="Gesprekken (deze maand)" value={totalMonth} />
        <MetricCard label="Kosten (deze maand)" value={formatCostUsd(totalCost)} sub="geschat, USD" />
      </div>

      <Card padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Gesprekken (wk)</th>
                <th>Gesprekken mnd</th>
                <th>Limiet</th>
                <th>Fallback</th>
                <th>Kosten/mnd</th>
              </tr>
            </thead>
            <tbody>
              {klanten.map((k) => {
                const us = usageLimitStatus(k.conversationsThisMonth, k.commercialStatus);
                return (
                  <tr key={k.slug}>
                    <td>
                      <Link href={`/admindashboard/klanten/${k.slug}?tab=usage`} style={{ textDecoration: 'none', color: 'var(--klant-ink)', fontWeight: 600, fontSize: 13.5 }}>
                        {k.name}
                      </Link>
                    </td>
                    <td style={{ fontSize: 13 }}>{k.conversationsThisWeek}</td>
                    <td style={{ fontSize: 13 }}>{k.conversationsThisMonth}</td>
                    <td><Pill tone={TONE_TO_PILL[us.tone]}>{us.label}</Pill></td>
                    <td style={{ fontSize: 13 }}>{k.fallbackPct == null ? '—' : `${k.fallbackPct}%`}</td>
                    <td style={{ fontSize: 13 }}>{formatCostUsd(k.monthCostUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="klant-hint" style={{ marginTop: 12 }}>
        Kosten zijn een schatting uit query_log (USD). Facturatie/billing valt buiten V0.
      </p>
    </>
  );
}
