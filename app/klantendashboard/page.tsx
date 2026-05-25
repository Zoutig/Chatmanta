// V0 Klantendashboard — Scherm 1: Overzicht (rebuild "Quiet Light / Aurora").
//
// Server component, force-dynamic: alle data is org-gescopt via cookie en
// wijzigt vaak. De hoofdrol is de TriagePanel — snel zien wat onbeantwoord is
// en het oplossen. Data-wrappers in lib/v0/klantendashboard/server/*.

import { getActiveOrgFromCookies, KNOWN_ORGS } from '@/lib/v0/server/active-org';
import {
  countMessagesAllTime,
  getOverviewMetrics,
  getSetupChecklist,
  getUnansweredQuestions,
} from '@/lib/v0/klantendashboard/server/metrics';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { getTopQuestions } from '@/lib/v0/klantendashboard/server/top-questions';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { PageHead } from './components/ui/page-head';
import { Btn } from './components/ui/btn';
import { Icon } from './components/ui/icons';
import { SetupChecklist } from './components/setup-checklist';
import { DismissibleBanner } from './components/dismissible-banner';
import { OnboardingTour } from './components/onboarding-tour';
import { StartTourButton } from './components/start-tour-button';
import { TriagePanel } from './components/overview/triage-panel';
import { MetricStrip } from './components/overview/metric-strip';
import { TopQuestionsBars } from './components/overview/top-questions-bars';

export const dynamic = 'force-dynamic';

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

export default async function OverviewPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const orgId = KNOWN_ORGS[activeOrg.slug].id;

  const metrics = await getOverviewMetrics(activeOrg.slug);
  const [unanswered, settings, testMessages] = await Promise.all([
    getUnansweredQuestions(activeOrg.slug, 3),
    getOrgSettings(activeOrg.slug),
    countMessagesAllTime(orgId),
  ]);
  const [checklist, topQuestions] = await Promise.all([
    getSetupChecklist(activeOrg.slug, metrics, {
      settingsSaved: settings.updatedAt !== null,
      testMessagesCount: testMessages,
    }),
    getTopQuestions(activeOrg.slug, settings.topQuestions),
  ]);

  // Zodra alle setup-stappen voltooid zijn, verdwijnt de "Aan de slag"-checklist
  // (de klant heeft de nudge niet meer nodig). every() op de 6 vaste stappen.
  const allStepsDone = checklist.every((s) => s.status === 'completed');

  const hasAnySource =
    metrics.sources.websitePages + metrics.sources.documents + metrics.sources.qaItems > 0;

  const today = new Date().toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <>
      <PageHead
        eyebrow={`Vandaag · ${today}`}
        title={`${timeGreeting()} — ${STATUS_CLAUSE[metrics.chatbotStatus]}.`}
        subtitle={buildSubtitle(
          metrics.weeklyAnswerSplit.answered,
          metrics.weeklyAnswerSplit.waiting,
          metrics.unansweredCount,
        )}
        actions={
          <>
            <StartTourButton />
            <Btn
              href="/widget"
              variant="secondary"
              leadingIcon={<Icon name="arrow-up-right" size={13} />}
            >
              Preview chatbot
            </Btn>
            <Btn
              href="/klantendashboard/kennisbank"
              variant="primary"
              leadingIcon={<Icon name="plus" size={13} />}
            >
              Kennis toevoegen
            </Btn>
          </>
        }
      />

      {/* Onboarding-nudges — alleen tonen als relevant; de onbeantwoord-flow
          zit nu in de TriagePanel hieronder, niet meer als banner. */}
      {(!hasAnySource || metrics.widgetStatus === 'not_installed') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {!hasAnySource && (
            <DismissibleBanner
              dismissId="no-sources"
              signature="active"
              variant="warning"
              title="Je hebt nog geen bronnen toegevoegd"
              message="Voeg websitepagina's, documenten of Q&A toe zodat je chatbot vragen kan beantwoorden."
              cta={{ label: 'Bronnen toevoegen', href: '/klantendashboard/kennisbank' }}
            />
          )}
          {metrics.widgetStatus === 'not_installed' && hasAnySource && (
            <DismissibleBanner
              dismissId="widget-not-installed"
              signature="active"
              variant="info"
              title="Je widget is nog niet geplaatst"
              message="Plaats de embed-code op je website om je chatbot zichtbaar te maken voor bezoekers."
              cta={{ label: 'Widget installeren', href: '/klantendashboard/widget' }}
            />
          )}
        </div>
      )}

      {/* Hero — triage van onbeantwoorde vragen */}
      <TriagePanel items={unanswered} total={metrics.unansweredCount} />

      {/* Metric-strip */}
      <div style={{ marginTop: 16 }}>
        <MetricStrip metrics={metrics} />
      </div>

      {/* Twee-koloms zolang de setup-checklist relevant is. Zodra alle stappen
          voltooid zijn verdwijnt de checklist en krijgt de vragen-grafiek de
          volle breedte — anders zou die halfbreed in de 2-koloms-grid hangen
          met een lege rechterkolom. Stapelt onder 880px. */}
      {allStepsDone ? (
        <div style={{ marginTop: 16 }}>
          <TopQuestionsBars result={topQuestions} />
        </div>
      ) : (
        <section className="grid-2col-stack" style={{ marginTop: 16 }}>
          <TopQuestionsBars result={topQuestions} />
          <div id="setup-checklist">
            <SetupChecklist steps={checklist} />
          </div>
        </section>
      )}

      {/* Interactieve rondleiding — start automatisch bij eerste bezoek per org. */}
      <OnboardingTour tourKey={activeOrg.slug} />
    </>
  );
}
