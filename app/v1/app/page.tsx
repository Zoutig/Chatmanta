// V1 /app: Overzicht-landing achter auth.
//
// Render-volgorde spiegelt V0 klantendashboard/page.tsx EXACT (faithful port):
//   PageHead (greeting + chatbotStatus + weekly-subtitle; acties: Rondleiding / Preview / Kennis)
//   → DismissibleBanner "geen bronnen" (conditioneel)
//   → DismissibleBanner "widget niet geïnstalleerd" (conditioneel)
//   → TriagePanel (altijd; zero-state of onbeantwoord-lijst)
//   → MetricStrip (4 kaarten)
//   → twee-koloms: TopQuestionsBars + SetupChecklist  (of volle breedte als alles klaar)
//   → OnboardingTour (verborgen; start via StartTourButton)
//
// V0-componenten worden IMPORT-ONLY hergebruikt via @/app/klantendashboard/*.
// V1-data → V0-component-shapes via inline adapter-objecten hieronder.
//
// ⚠️ Twee V0-componenten bevatten hardgecodeerde /klantendashboard/-hrefs die
//    hier NIET kunnen worden overreden (geen href-props):
//      • TriagePanel: "Bekijk gesprek" → /klantendashboard/gesprekken?filter=unanswered
//                     "Antwoord toevoegen" → /klantendashboard/kennisbank
//      • TopQuestionsBars: "Alles ›" → /klantendashboard/gesprekken?view=top-questions
//    Te fixen door die components te forken naar app/v1/app/_overview/ als de V0-
//    routes definitief worden opgeruimd.
//
// Auth-keten (ongewijzigd):
//   geen sessie → getSessionOrg → requireAuth → redirect /v1/login (NEXT_REDIRECT
//                 is geen AppError → valt door naar de re-throw)
//   wél lid     → resolveer org (uit de sessie) + chatbot → render het overzicht
//   geen lid    → AUTH_FORBIDDEN → "Geen toegang"

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { Btn } from '@/app/klantendashboard/components/ui/btn';
import { Icon } from '@/app/klantendashboard/components/ui/icons';
import { DismissibleBanner } from '@/app/klantendashboard/components/dismissible-banner';
import { TriagePanel } from './_overview/triage-panel';
import { MetricStrip } from '@/app/klantendashboard/components/overview/metric-strip';
import { TopQuestionsBars } from './_overview/top-questions-bars';
import { OnboardingTour } from '@/app/klantendashboard/components/onboarding-tour';
import { StartTourButton } from '@/app/klantendashboard/components/start-tour-button';
import { getOrgChatbot } from './rag-config';
import { getV1OverviewMetrics } from '@/lib/v1/dashboard/metrics';
import { SetupChecklist } from './_overview/setup-checklist';
// Type-only imports van V0-shapes — voor adapter-objecten die aan de hergebruikte
// V0-componenten worden doorgegeven. Geen runtime-impact.
import type { OverviewMetrics, UnansweredQuestion, ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import type { KlantFaqResult } from '@/lib/v0/klantendashboard/server/top-questions';
import type { TourStep } from '@/app/klantendashboard/components/onboarding-tour';

export const dynamic = 'force-dynamic';

// --- Verbatim van V0 klantendashboard/page.tsx ---

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Goedenacht';
  if (h < 12) return 'Goedemorgen';
  if (h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

const STATUS_CLAUSE: Record<ChatbotStatus, string> = {
  live: 'je chatbot staat live',
  paused: 'je chatbot staat op pauze',
  testing: 'je chatbot draait in testmodus',
  concept: 'je chatbot is nog in concept',
};

function buildSubtitle(answered: number, waiting: number, unansweredCount: number): string {
  const totalWeek = answered + waiting;
  if (totalWeek === 0) {
    return 'Nog geen vragen deze week — je chatbot staat klaar voor bezoekers.';
  }
  const base = `Deze week kreeg je chatbot ${totalWeek} vra${totalWeek === 1 ? 'ag' : 'gen'} en beantwoordde er ${answered} zelf.`;
  if (unansweredCount === 0) return `${base} Alles is afgehandeld.`;
  return `${base} ${unansweredCount} ${unansweredCount === 1 ? 'vraag wacht' : 'vragen wachten'} op jouw input.`;
}

// V1-specifieke rondleiding — selectors passen op /v1/app/* sidebar-links
// i.p.v. de V0 /klantendashboard/*-links in DEFAULT_STEPS.
const V1_TOUR_STEPS: TourStep[] = [
  {
    selector: null,
    placement: 'center',
    title: 'Welkom bij ChatManta 👋',
    body: 'In een paar stappen laten we zien waar alles staat. Je kunt de rondleiding altijd overslaan.',
  },
  {
    selector: 'a[href="/v1/app/kennisbank"]',
    placement: 'right',
    title: 'Kennisbank',
    body: 'Hier voeg je je website en documenten toe. Dit is de kennis waaruit je chatbot put — zonder bronnen kan hij nog niets beantwoorden.',
  },
  {
    selector: 'a[href="/v1/app/preview"]',
    placement: 'right',
    title: 'Preview Chatbot',
    body: 'Zie je chatbot zoals een bezoeker hem op je eigen site ziet, en stel zelf testvragen vóór je live gaat.',
  },
  {
    selector: 'a[href="/v1/app/widget"]',
    placement: 'right',
    title: 'Widget',
    body: 'Pas de kleuren aan en kopieer de code om de chatbot op je eigen website te zetten.',
  },
  {
    selector: '#setup-checklist',
    placement: 'bottom',
    title: 'Aan de slag',
    body: 'Volg deze checklist. Staat alles op groen, dan is je chatbot live!',
  },
];

// --- Pagina ---

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
      </>
    );
  }

  const m = await getV1OverviewMetrics(supabase, orgId, chatbot.id);

  const widgetInstalled = m.widgetStatus !== 'not_installed';
  // allStepsDone spiegelt V0's checklist.every(s => s.status === 'completed'):
  // setup-checklist verdwijnt zodra alle V1-stappen groen zijn.
  const allSetupDone =
    m.setup.hasDocument && m.setup.hasKnowledgeSource && m.setup.hasTraffic && widgetInstalled;
  const hasAnySource =
    m.sources.websitePages + m.sources.documents + m.sources.qaItems > 0;

  const today = new Date().toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // --- Adapters: V1OverviewMetrics → V0-component-shapes ---

  // MetricStrip verwacht OverviewMetrics (V0-type); velden spiegelen 1-op-1.
  const metricsAdapter: OverviewMetrics = {
    chatbotStatus: m.chatbotStatus,
    widgetStatus: m.widgetStatus,
    sources: m.sources,
    conversationsThisMonth: m.conversationsThisMonth,
    unansweredCount: m.unansweredTotal,
    latestUnansweredAt: m.latestUnansweredAt,
    helpfulness: m.helpfulness,
    conversationsTrend: m.conversationsTrend,
    conversationsWeekDelta: m.conversationsWeekDelta,
    weeklyAnswerSplit: m.weeklyAnswerSplit,
  };

  // TriagePanel verwacht UnansweredQuestion[] + total: number.
  // V1 heeft geen queryLogId per vraag — optioneel veld, weggelaten.
  const triageItems: UnansweredQuestion[] = m.unanswered.slice(0, 3).map((u) => ({
    question: u.question,
    occurrences: u.occurrences,
    lastSeenAt: u.lastSeenAt,
  }));

  // TopQuestionsBars verwacht KlantFaqResult (snapshot-shape). V1 heeft geen
  // echte FAQ-snapshot; we bouwen een live-equivalent zonder cluster-info.
  // pending=true zolang er geen verkeer is (verbergt dan de lege ranglijst).
  const topQuestionsResult: KlantFaqResult = {
    items: m.topQuestions.map((q) => ({
      question: q.question,
      count: q.count,
      lastAskedAt: q.lastAskedAt,
      lastStatus: q.unanswered ? 'unanswered' : 'answered',
      memberQuestions: [q.question],
      paraphraseCount: 0,
    })),
    totalUnique: m.topQuestions.length,
    pending: m.scannedThisMonth === 0,
    generatedAt: null,
  };

  return (
    <>
      <PageHead
        eyebrow={`Vandaag · ${today}`}
        title={`${timeGreeting()} — ${STATUS_CLAUSE[m.chatbotStatus]}.`}
        subtitle={buildSubtitle(
          m.weeklyAnswerSplit.answered,
          m.weeklyAnswerSplit.waiting,
          m.unansweredTotal,
        )}
        actions={
          <>
            <StartTourButton />
            <Btn
              href="/v1/app/preview"
              variant="secondary"
              leadingIcon={<Icon name="arrow-up-right" size={13} />}
            >
              Preview chatbot
            </Btn>
            <Btn
              href="/v1/app/kennisbank"
              variant="primary"
              leadingIcon={<Icon name="plus" size={13} />}
            >
              Kennis toevoegen
            </Btn>
          </>
        }
      />

      {/* Onboarding-nudges — alleen tonen als relevant. */}
      {(!hasAnySource || m.widgetStatus === 'not_installed') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {!hasAnySource && (
            <DismissibleBanner
              dismissId="v1-no-sources"
              signature="active"
              variant="warning"
              title="Je hebt nog geen bronnen toegevoegd"
              message="Voeg websitepagina's, documenten of Q&A toe zodat je chatbot vragen kan beantwoorden."
              cta={{ label: 'Bronnen toevoegen', href: '/v1/app/kennisbank' }}
            />
          )}
          {m.widgetStatus === 'not_installed' && hasAnySource && (
            <DismissibleBanner
              dismissId="v1-widget-not-installed"
              signature="active"
              variant="info"
              title="Je widget is nog niet geplaatst"
              message="Plaats de embed-code op je website om je chatbot zichtbaar te maken voor bezoekers."
              cta={{ label: 'Widget installeren', href: '/v1/app/widget' }}
            />
          )}
        </div>
      )}

      {/* Hero — triage van onbeantwoorde vragen. */}
      <TriagePanel items={triageItems} total={m.unansweredTotal} />

      {/* Metric-strip */}
      <div style={{ marginTop: 16 }}>
        <MetricStrip metrics={metricsAdapter} />
      </div>

      {/* Twee-koloms zolang de setup-checklist relevant is. Zodra alle stappen
          voltooid zijn verdwijnt de checklist en krijgt de grafiek de volle breedte.
          Stapelt onder 880px (grid-2col-stack uit klant.css). */}
      {allSetupDone ? (
        <div style={{ marginTop: 16 }}>
          <TopQuestionsBars result={topQuestionsResult} />
        </div>
      ) : (
        <section className="grid-2col-stack" style={{ marginTop: 16 }}>
          <TopQuestionsBars result={topQuestionsResult} />
          <div id="setup-checklist">
            <SetupChecklist setup={m.setup} widgetInstalled={widgetInstalled} />
          </div>
        </section>
      )}

      {/* Interactieve rondleiding — start NIET automatisch; alleen via StartTourButton.
          V1-stappen verwijzen naar /v1/app/* sidebar-links i.p.v. /klantendashboard/*. */}
      <OnboardingTour
        tourKey={orgId}
        autoStart={false}
        steps={V1_TOUR_STEPS}
        setupChecklistVisible={!allSetupDone}
      />
    </>
  );
}
