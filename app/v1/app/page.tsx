import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { MetricCard } from '@/app/admindashboard/components/metric-card';
import { getOrgChatbot } from './rag-config';
import { getV1OverviewMetrics } from '@/lib/v1/dashboard/metrics';
import { TopQuestions, UnansweredQuestions, SetupChecklist } from './_overview/sections';

// V1 /app: Overzicht-landing achter auth. Auth-keten (ongewijzigd):
//   geen sessie → getSessionOrg → requireAuth → redirect /v1/login (NEXT_REDIRECT
//                 is geen AppError → valt door naar de re-throw)
//   wél lid     → resolveer org (uit de sessie) + chatbot → render het overzicht
//   geen lid    → AUTH_FORBIDDEN → "Geen toegang"
// orgId komt uit de sessie (organization_members), niet uit env. De chat is
// verhuisd naar /v1/app/preview. De shell (sidebar/topbar/<main>) komt uit
// layout.tsx — hier alléén binnen-content.
export const dynamic = 'force-dynamic';

export default async function V1OverviewPage() {
  let session: Awaited<ReturnType<typeof getSessionOrg>>;
  try {
    session = await getSessionOrg();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead
          eyebrow="Overzicht"
          title="Geen toegang"
          subtitle="Je bent geen lid van deze organisatie."
        />
      );
    }
    throw e;
  }
  const { orgId } = session;

  // Lees onder de session-client (RLS afgedwongen). Geen chatbot → nette fail-tak,
  // nooit een lege chatbotId naar de metric-reads.
  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);

  if (!chatbot) {
    return (
      <>
        <PageHead
          eyebrow="Overzicht"
          title="Je chatbot"
          subtitle="Deze organisatie heeft nog geen chatbot geconfigureerd."
        />
        <Card>
          <p style={{ fontSize: 14, color: 'var(--klant-muted)', margin: 0 }}>
            Zodra er een chatbot is, verschijnen hier je gesprekken, kosten en de meest gestelde vragen.
          </p>
        </Card>
      </>
    );
  }

  const m = await getV1OverviewMetrics(supabase, orgId, chatbot.id);
  const allSetupDone = m.setup.hasDocument && m.setup.hasKnowledgeSource && m.setup.hasTraffic;

  const subtitle =
    m.conversationsThisMonth === 0
      ? 'Nog geen gesprekken deze maand — je chatbot staat klaar voor bezoekers.'
      : `Deze maand voerde je chatbot ${m.conversationsThisMonth} gesprek${
          m.conversationsThisMonth === 1 ? '' : 'ken'
        }.`;

  return (
    <>
      <PageHead eyebrow="Overzicht" title={chatbot.name} subtitle={subtitle} />

      {/* Kerncijfers */}
      <div className="klant-metrics-grid">
        <MetricCard label="Gesprekken" value={m.conversationsThisMonth} sub="deze maand" />
        <MetricCard label="Kosten" value={`€${m.spendThisMonthEur.toFixed(2)}`} sub="deze maand" />
        <MetricCard
          label="Weiger-ratio"
          value={m.refusalRate === null ? '—' : `${Math.round(m.refusalRate * 100)}%`}
          tone={m.refusalRate !== null && m.refusalRate >= 0.3 ? 'warn' : 'ink'}
          sub={m.scannedThisMonth > 0 ? `over ${m.scannedThisMonth} vragen` : 'nog geen verkeer'}
        />
        <MetricCard
          label="Snelheid"
          value={m.latency.p50 === null ? '—' : `${Math.round(m.latency.p50)} ms`}
          sub={m.latency.p95 === null ? 'mediaan responstijd' : `p95 ${Math.round(m.latency.p95)} ms`}
        />
      </div>

      {/* Onboarding-nudge zolang de setup niet rond is */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        {!allSetupDone && <SetupChecklist setup={m.setup} />}
        <TopQuestions items={m.topQuestions} />
        <UnansweredQuestions items={m.unanswered} />
      </div>
    </>
  );
}
