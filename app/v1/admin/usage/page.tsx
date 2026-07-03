// V1 Admin — Usage & Kosten. Port van app/admindashboard/usage/page.tsx.
//
// Verschillen t.o.v. V0:
//   - Kosten in EUR (ControlRoomKlant.monthCostEur), niet USD.
//   - Geen vaste gesprekslimieten (MONTHLY_CONVERSATION_LIMITS) — vervangen
//     door per-org EUR-budget-benutting (organizations.daily_budget_eur × 30).
//   - getKlantenWithBudgets() laadt klanten + budgets in één stap.
//   - getOpenAiCostsThisMonth() is hergebruikt as-is (geen V0-DB-afhankelijkheid).

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { MetricCard } from '@/app/admindashboard/components/metric-card';
import { ReloadButton } from '@/app/admindashboard/components/reload-button';
import { getOpenAiCostsThisMonth } from '@/lib/controlroom/server/openai-costs';
import { isAppError } from '@/lib/errors/app-error';
import {
  getKlantenWithBudgets,
  budgetUtilStatus,
  formatCostEur,
  type BudgetTone,
} from '@/lib/v1/admin/usage';

export const dynamic = 'force-dynamic';

// BudgetTone → PillTone mapping (ponytail: inline, geen aparte const-file)
const BUDGET_TO_PILL: Record<BudgetTone, PillTone> = {
  ink: 'neutral',
  warn: 'warn',
  danger: 'danger',
};

export default async function V1UsagePage() {
  let klanten;
  try {
    klanten = await getKlantenWithBudgets();
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

  const realCost = await getOpenAiCostsThisMonth();

  const totalMonth = klanten.reduce((a, k) => a + k.conversationsThisMonth, 0);
  const totalWeek = klanten.reduce((a, k) => a + k.conversationsThisWeek, 0);
  const totalCostEur = klanten.reduce((a, k) => a + k.monthCostEur, 0);

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Usage &amp; Kosten</h1>
          <p className="klant-page-sub">
            Klant-chatbot-verbruik en kosten per klant deze maand, met EUR-budget-benutting.
          </p>
        </div>
        <ReloadButton />
      </header>

      <div className="klant-metrics-grid" style={{ marginBottom: 20 }}>
        <MetricCard label="Gesprekken (deze week)" value={totalWeek} />
        <MetricCard label="Gesprekken (deze maand)" value={totalMonth} />
        <MetricCard
          label="Kosten klant-chatbots (deze maand)"
          value={formatCostEur(totalCostEur)}
          sub="token-telling per gesprek × modelprijs · evals niet meegerekend"
        />
        {realCost.available ? (
          <MetricCard
            label="Totaal OpenAI-account (deze maand)"
            value={`$${realCost.amountUsd.toFixed(2)}`}
            tone="info"
            sub="incl. evals, dev & embeddings · niet alleen klant-chatbots"
          />
        ) : null}
      </div>

      <Card padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Gesprekken (wk)</th>
                <th>Gesprekken mnd</th>
                <th>Dag-budget</th>
                <th>Budget-benutting</th>
                <th>Fallback</th>
                <th>Kosten/mnd</th>
              </tr>
            </thead>
            <tbody>
              {klanten.map((k) => {
                const budget = budgetUtilStatus(k.monthCostEur, k.dailyBudgetEur);
                return (
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
                    <td style={{ fontSize: 13 }}>{k.conversationsThisWeek}</td>
                    <td style={{ fontSize: 13 }}>{k.conversationsThisMonth}</td>
                    <td style={{ fontSize: 13 }}>{formatCostEur(k.dailyBudgetEur)}/dag</td>
                    <td>
                      <Pill tone={BUDGET_TO_PILL[budget.tone]}>{budget.label}</Pill>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {k.fallbackPct == null ? '—' : `${k.fallbackPct}%`}
                    </td>
                    <td style={{ fontSize: 13 }}>{formatCostEur(k.monthCostEur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="klant-hint" style={{ marginTop: 12 }}>
        <strong>Kosten klant-chatbots</strong> komt uit <code>query_log.cost_eur</code>: de
        token-telling per gesprek × de modelprijs, over de volledige chat-pipeline (embedding +
        rewrite/HyDE + rerank + antwoord + follow-ups).{' '}
        <strong>Eval-/judge-runs tellen hier niet mee.</strong> De kolom{' '}
        <em>Budget-benutting</em> toont <code>maandkosten ÷ (dag-budget × 30)</code> als
        proxy — het dag-budget is instelbaar per klant via de organisatie-deep-dive.
        {realCost.available ? (
          <>
            {' '}Het <strong>Totaal OpenAI-account</strong> komt uit de OpenAI Costs-API (het
            gefactureerde bedrag over het hele account, incl. evals, dev/test en embeddings buiten
            het chat-pad, doorgaans enkele uren vertraagd).
          </>
        ) : (
          <>
            {' '}Het totale OpenAI-accountbedrag vereist een org-admin-key (
            <code>OPENAI_ADMIN_KEY</code> + <code>OPENAI_ORG_ID</code>) — ontbreekt of
            onbereikbaar.
          </>
        )}
      </p>
    </>
  );
}
