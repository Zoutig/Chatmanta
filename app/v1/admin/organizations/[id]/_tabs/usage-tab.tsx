// V1 admin — Usage tab (server RSC).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getAdminUsage } from '@/lib/v1/admin/klant-detail';
import { checkOrgDailyBudget } from '@/lib/v1/limits/usage-limits';
import { MetricCard } from '@/app/admindashboard/components/metric-card';

function fmtEur(n: number) {
  return `€${n.toFixed(n < 1 ? 3 : 2)}`;
}

export async function UsageTab({ orgId }: { orgId: string }) {
  const admin = await getJorionAdminClient();
  const [usage, budget] = await Promise.all([
    getAdminUsage(admin, orgId),
    checkOrgDailyBudget(admin, orgId),
  ]);

  return (
    <div className="klant-metrics-grid">
      <MetricCard
        label="Verbruik vandaag"
        value={`${fmtEur(budget.spentEur)} / ${fmtEur(budget.capEur)}`}
        tone={budget.over ? 'danger' : 'ink'}
        sub={budget.over ? 'GECAPT — dag-cap bereikt' : 'binnen dag-budget'}
      />
      <MetricCard label="Queries (totaal)" value={usage.queryCount} />
      <MetricCard label="Kosten (totaal)" value={fmtEur(usage.totalCostEur)} sub="EUR all-time" />
      <MetricCard label="Queries (deze maand)" value={usage.thisMonthQueryCount} />
      <MetricCard label="Kosten (deze maand)" value={fmtEur(usage.thisMonthCostEur)} sub="EUR" />
    </div>
  );
}
