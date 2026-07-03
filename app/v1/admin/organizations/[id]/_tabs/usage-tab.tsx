// V1 admin — Usage tab (server RSC).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getAdminUsage } from '@/lib/v1/admin/klant-detail';
import { MetricCard } from '@/app/admindashboard/components/metric-card';

function fmtEur(n: number) {
  return `€${n.toFixed(n < 1 ? 3 : 2)}`;
}

export async function UsageTab({ orgId }: { orgId: string }) {
  const admin = await getJorionAdminClient();
  const usage = await getAdminUsage(admin, orgId);

  return (
    <div className="klant-metrics-grid">
      <MetricCard label="Queries (totaal)" value={usage.queryCount} />
      <MetricCard label="Kosten (totaal)" value={fmtEur(usage.totalCostEur)} sub="EUR all-time" />
      <MetricCard label="Queries (deze maand)" value={usage.thisMonthQueryCount} />
      <MetricCard label="Kosten (deze maand)" value={fmtEur(usage.thisMonthCostEur)} sub="EUR" />
    </div>
  );
}
