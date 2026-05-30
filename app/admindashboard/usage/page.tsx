// Admin Dashboard — Usage & Kosten (MD §16). Cross-org verbruik + geschatte kosten
// + maandlimiet-status. Leest dezelfde getControlRoomKlanten-aggregatie.

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { getControlRoomKlanten } from '@/lib/controlroom/server/overview';
import { getOpenAiCostsThisMonth } from '@/lib/controlroom/server/openai-costs';
import { usageLimitStatus, type UsageLimitTone } from '@/lib/controlroom/usage-limits';
import { formatCostUsd } from '@/lib/controlroom/format';
import { MetricCard } from '../components/metric-card';
import { ReloadButton } from '../components/reload-button';

export const dynamic = 'force-dynamic';

const TONE_TO_PILL: Record<UsageLimitTone, PillTone> = {
  ink: 'neutral',
  warn: 'warn',
  danger: 'danger',
  success: 'success',
};

export default async function UsagePage() {
  const [klanten, realCost] = await Promise.all([
    getControlRoomKlanten(),
    getOpenAiCostsThisMonth(),
  ]);
  const totalMonth = klanten.reduce((a, k) => a + k.conversationsThisMonth, 0);
  const totalWeek = klanten.reduce((a, k) => a + k.conversationsThisWeek, 0);
  const totalCost = klanten.reduce((a, k) => a + k.monthCostUsd, 0);

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Usage &amp; Kosten</h1>
          <p className="klant-page-sub">Klant-chatbot-verbruik en kosten per klant deze maand, met limietstatus.</p>
        </div>
        <ReloadButton />
      </header>

      <div className="klant-metrics-grid" style={{ marginBottom: 20 }}>
        <MetricCard label="Gesprekken (deze week)" value={totalWeek} />
        <MetricCard label="Gesprekken (deze maand)" value={totalMonth} />
        <MetricCard
          label="Kosten klant-chatbots (deze maand)"
          value={formatCostUsd(totalCost)}
          sub="token-telling per gesprek × modelprijs · evals niet meegerekend"
        />
        {realCost.available ? (
          <MetricCard
            label="Totaal OpenAI-account (deze maand)"
            value={formatCostUsd(realCost.amountUsd)}
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
        <strong>Kosten klant-chatbots</strong> (de kaart hierboven en de kolom <em>Kosten/mnd</em>) komt
        uit <code>query_log</code>: de token-telling per gesprek × de modelprijs, opgeteld over de
        volledige chat-pipeline (embedding + rewrite/HyDE + rerank + antwoord + follow-ups). Dit wordt
        alléén op het live chat-pad geschreven, dus <strong>eval-/judge-runs tellen hier niet mee</strong> —
        precies het klant-verbruik dat je wilt zien, en bruikbaar voor de verdeling per klant.
        {realCost.available ? (
          <>
            {' '}Het <strong>Totaal OpenAI-account</strong> komt uit de OpenAI Costs-API: het gefactureerde
            bedrag over het hele account (alle projecten samen, incl. evals, dev/test en embeddings buiten
            het chat-pad, doorgaans enkele uren vertraagd). Het is dus hoger dan en niet vergelijkbaar met
            het klant-chatbot-verbruik.
          </>
        ) : (
          <>
            {' '}Het totale OpenAI-accountbedrag (incl. evals &amp; dev) vereist een org-admin-key
            (<code>OPENAI_ADMIN_KEY</code> + <code>OPENAI_ORG_ID</code>) — die ontbreekt hier of is nu
            onbereikbaar. Op productie moet de key in de Vercel-omgevingsvariabelen staan, niet alleen
            lokaal.
          </>
        )}
      </p>
    </>
  );
}
