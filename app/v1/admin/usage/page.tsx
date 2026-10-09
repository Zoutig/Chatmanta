// V1 Admin — Gebruik en kosten.
//
//   - Kosten in EUR (ControlRoomKlant.monthCostEur).
//   - Geen vaste gesprekslimieten: per-org EUR-budget-benutting
//     (organizations.daily_budget_eur × 30).
//   - getKlantenWithBudgets() laadt klanten + budgets in één stap.
//   - Het OpenAI-accounttotaal (getOpenAiCostsThisMonth, tot ~12 s) staat in een
//     eigen Suspense-blok, zodat de rest van de pagina niet daarop wacht.

import Link from 'next/link';
import { Suspense } from 'react';
import { getOpenAiCostsThisMonth } from '@/lib/controlroom/server/openai-costs';
import { isAppError } from '@/lib/errors/app-error';
import { getKlantenWithBudgets, budgetUtilStatus, type BudgetTone } from '@/lib/v1/admin/usage';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Badge, EmptyState, InfoTip, type Tone } from '@/app/v1/_ui/feedback';
import { Metric, MetricGrid } from '../_ui/metric';
import { ReloadButton } from '../_ui/reload-button';
import { DataTable, NumCell } from '../_ui/data-table';
import { formatEur, formatUsd } from '../_ui/format';

export const dynamic = 'force-dynamic';

const BUDGET_TONE: Record<BudgetTone, Tone> = { ink: 'neutral', warn: 'warn', danger: 'danger' };

/** Totaal OpenAI-account: los geladen, kan traag zijn. */
async function OpenAiTotal() {
  const realCost = await getOpenAiCostsThisMonth();
  if (!realCost.available) {
    return (
      <Metric
        label="Totaal OpenAI-account deze maand"
        value="Niet beschikbaar"
        info={<InfoTip text="Hiervoor is een OpenAI-beheersleutel nodig (OPENAI_ADMIN_KEY en OPENAI_ORG_ID). Die ontbreekt of de OpenAI Costs-API is niet bereikbaar." />}
      />
    );
  }
  return (
    <Metric
      label="Totaal OpenAI-account deze maand"
      value={formatUsd(realCost.amountUsd)}
      tone="accent"
      sub="Inclusief evaluaties, ontwikkeling en embeddings"
      info={<InfoTip text="Het gefactureerde bedrag over het hele OpenAI-account, uit de OpenAI Costs-API. Meestal enkele uren vertraagd. In dollars, zoals OpenAI factureert." />}
    />
  );
}

function OpenAiTotalLoading() {
  return <Metric label="Totaal OpenAI-account deze maand" value="Laden…" />;
}

export default async function V1UsagePage() {
  let klanten;
  try {
    klanten = await getKlantenWithBudgets();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e;
  }

  const totalMonth = klanten.reduce((a, k) => a + k.conversationsThisMonth, 0);
  const totalWeek = klanten.reduce((a, k) => a + k.conversationsThisWeek, 0);
  const totalCostEur = klanten.reduce((a, k) => a + k.monthCostEur, 0);

  return (
    <div className="v1-page">
      <PageHeader
        title="Gebruik en kosten"
        description="Verbruik en kosten per klant deze maand, met de benutting van het budget."
        actions={<ReloadButton />}
      />

      <MetricGrid>
        <Metric label="Gesprekken deze week" value={totalWeek} />
        <Metric label="Gesprekken deze maand" value={totalMonth} />
        <Metric
          label="Kosten klant-chatbots deze maand"
          value={formatEur(totalCostEur)}
          sub="Zonder evaluaties"
          info={<InfoTip text="Uit query_log.cost_eur: de tokentelling per gesprek maal de modelprijs, over de hele chat-pipeline (embedding, herformulering, rerank, antwoord en vervolgvragen). Evaluaties tellen niet mee." />}
        />
        <Suspense fallback={<OpenAiTotalLoading />}>
          <OpenAiTotal />
        </Suspense>
      </MetricGrid>

      <section className="v1-card">
        {klanten.length === 0 ? (
          <EmptyState>Nog geen klanten.</EmptyState>
        ) : (
          <DataTable
            label="Gebruik per klant"
            columns={[
              { label: 'Klant' },
              { label: 'Gesprekken (week)', num: true },
              { label: 'Gesprekken (maand)', num: true },
              { label: 'Dagbudget', num: true },
              { label: 'Vandaag', num: true },
              {
                label: (
                  <>
                    Budgetbenutting{' '}
                    <InfoTip text="Maandkosten gedeeld door dagbudget maal 30, als benadering. Het dagbudget stel je per klant in op de klantpagina." />
                  </>
                ),
              },
              { label: 'Niet beantwoord', num: true },
              { label: 'Kosten (maand)', num: true },
            ]}
          >
            {klanten.map((k) => {
              const budget = budgetUtilStatus(k.monthCostEur, k.dailyBudgetEur);
              return (
                <tr key={k.orgId}>
                  <td>
                    <Link href={`/v1/admin/organizations/${k.orgId}`} className="v1-adm-clip">
                      {k.name}
                    </Link>
                  </td>
                  <NumCell>{k.conversationsThisWeek}</NumCell>
                  <NumCell>{k.conversationsThisMonth}</NumCell>
                  <NumCell>{k.dailyBudgetEur > 0 ? `${formatEur(k.dailyBudgetEur)} per dag` : 'Uit'}</NumCell>
                  <NumCell>
                    {formatEur(k.spentTodayEur)}
                    {k.cappedToday ? (
                      <>
                        {' '}
                        <Badge tone="danger">Limiet bereikt</Badge>
                      </>
                    ) : null}
                  </NumCell>
                  <td>
                    <Badge tone={BUDGET_TONE[budget.tone]}>{budget.label}</Badge>
                  </td>
                  <NumCell>{k.fallbackPct == null ? 'Geen data' : `${k.fallbackPct}%`}</NumCell>
                  <NumCell>{formatEur(k.monthCostEur)}</NumCell>
                </tr>
              );
            })}
          </DataTable>
        )}
      </section>
    </div>
  );
}
