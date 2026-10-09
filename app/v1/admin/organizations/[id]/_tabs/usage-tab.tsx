// V1 admin — Gebruik tab (server RSC).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getAdminUsage } from '@/lib/v1/admin/klant-detail';
import { checkOrgDailyBudget } from '@/lib/v1/limits/usage-limits';
import { Metric, MetricGrid } from '@/app/v1/admin/_ui/metric';
import { formatEur } from '@/app/v1/admin/_ui/format';

export async function UsageTab({ orgId }: { orgId: string }) {
  const admin = await getJorionAdminClient();
  const [usage, budget] = await Promise.all([
    getAdminUsage(admin, orgId),
    checkOrgDailyBudget(admin, orgId),
  ]);

  const todayValue =
    budget.capEur === 0 ? formatEur(budget.spentEur) : `${formatEur(budget.spentEur)} van ${formatEur(budget.capEur)}`;
  const todaySub = budget.over
    ? 'Daglimiet bereikt'
    : budget.capEur === 0
      ? 'Dagbudget staat uit'
      : 'Binnen het dagbudget';

  return (
    <MetricGrid>
      <Metric label="Verbruik vandaag" value={todayValue} tone={budget.over ? 'danger' : 'ink'} sub={todaySub} />
      <Metric label="Vragen (totaal)" value={usage.queryCount} />
      <Metric label="Kosten (totaal)" value={formatEur(usage.totalCostEur)} sub="Sinds de start" />
      <Metric label="Vragen deze maand" value={usage.thisMonthQueryCount} />
      <Metric label="Kosten deze maand" value={formatEur(usage.thisMonthCostEur)} />
    </MetricGrid>
  );
}
