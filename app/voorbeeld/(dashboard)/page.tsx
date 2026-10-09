// Voorbeeld-dashboard: Overzicht. Kopie van app/v1/app/page.tsx met vaste
// voorbeeldcijfers (lib/voorbeeld/fixtures/overzicht.ts) in plaats van
// database-reads. De setup is af en er speelt niets kritieks, dus bovenaan
// staat geen blok. De cijferstrook is een client component (DemoStats) zodat
// hij de demo-instellingen van de bezoeker volgt.

import Link from 'next/link';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { EmptyState, StatusPill } from '@/app/v1/_ui/feedback';
import { List, ListRow, SectionHead } from '@/app/v1/_ui/list';
import { OnboardingTour, type TourStep } from '@/app/klantendashboard/components/onboarding-tour';
import { DEMO_SHELL } from '@/lib/voorbeeld/fixtures/shell';
import { getFixtureOverviewMetrics } from '@/lib/voorbeeld/fixtures/overzicht';
import { NextStep } from './_overview/next-step';
import { TourButton } from './_overview/tour-button';
import { DemoStats } from './_overview/demo-stats';
import './_overview/overview.css';

// Begroeting en datums hangen van het tijdstip af: per request renderen.
export const dynamic = 'force-dynamic';

const TZ = 'Europe/Amsterdam';

function timeGreeting(): string {
  const h = Number(
    new Intl.DateTimeFormat('nl-NL', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date()),
  );
  if (h < 6) return 'Goedenacht';
  if (h < 12) return 'Goedemorgen';
  if (h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: TZ });
}

const QA_HREF = '/voorbeeld/kennisbank?tab=qa&prefillQuestion=';

// Rondleiding: selectors bestaan in de nieuwe schil en op dit scherm.
// '#setup-checklist' (het volgende-stap-blok) wordt door OnboardingTour
// weggefilterd als dat blok niet getoond wordt (setupChecklistVisible=false).
const TOUR_STEPS: TourStep[] = [
  { selector: null, placement: 'center', title: 'Welkom bij ChatManta', body: 'In een paar stappen zie je waar alles staat.' },
  {
    selector: '#v1-sidebar a[href="/voorbeeld/kennisbank"]',
    placement: 'right',
    title: 'Kennisbank',
    body: 'Voeg je website en documenten toe. Hieruit haalt je chatbot zijn antwoorden.',
  },
  {
    selector: '#v1-ov-preview',
    placement: 'bottom',
    title: 'Bekijk chatbot',
    body: 'Zie je chatbot zoals bezoekers hem zien en stel zelf een paar testvragen.',
  },
  {
    selector: '#v1-sidebar a[href="/voorbeeld/widget"]',
    placement: 'right',
    title: 'Widget',
    body: 'Kies je kleuren en kopieer de code voor je website.',
  },
  {
    selector: '#setup-checklist',
    placement: 'bottom',
    title: 'Volgende stap',
    body: 'Hier zie je wat er nog moet gebeuren voor je chatbot live staat.',
  },
];

export default function V1OverviewPage() {
  const m = getFixtureOverviewMetrics();
  const widgetInstalled = m.widgetStatus !== 'not_installed';
  const allSetupDone = m.setup.hasDocument && m.setup.hasKnowledgeSource && m.setup.hasTraffic && widgetInstalled;
  const showNextStep = !allSetupDone;
  const status = DEMO_SHELL.chatbotStatus;

  const unanswered = m.unanswered.slice(0, 5);
  const top = m.topQuestions;
  const topMax = top.length > 0 ? Math.max(...top.map((q) => q.count)) : 1;

  return (
    <div className="v1-page">
      <PageHeader
        title={timeGreeting()}
        description="Hoe je chatbot ervoor staat en waar hij je hulp nodig heeft."
        actions={
          <>
            <StatusPill status={status} />
            <TourButton />
            <Link id="v1-ov-preview" href="/voorbeeld/preview" className={buttonClass({ variant: 'secondary' })}>
              Bekijk chatbot
            </Link>
          </>
        }
      />

      {showNextStep ? <NextStep setup={m.setup} widgetInstalled={widgetInstalled} /> : null}

      <DemoStats metrics={m} contactRequestsNewCount={DEMO_SHELL.contactRequestsNewCount} />

      <div className="v1-ov-cols">
        <section className="v1-card v1-ov-card-list" aria-label="Hier wist je chatbot het niet">
          <SectionHead title="Hier wist je chatbot het niet" link={{ href: '/voorbeeld/gesprekken', label: 'Alle gesprekken' }} />
          {unanswered.length === 0 ? (
            <EmptyState>Alles beantwoord. Wat je chatbot niet weet, verschijnt hier.</EmptyState>
          ) : (
            <List label="Onbeantwoorde vragen">
              {unanswered.map((u) => (
                <ListRow
                  key={u.question}
                  wrap
                  title={u.question}
                  meta={[`${u.occurrences} keer gevraagd`, shortDate(u.lastSeenAt)].filter(Boolean).join(' · ')}
                  end={
                    <Link
                      href={`${QA_HREF}${encodeURIComponent(u.question)}`}
                      className={buttonClass({ variant: 'secondary', size: 'sm' })}
                    >
                      Antwoord geven
                    </Link>
                  }
                />
              ))}
            </List>
          )}
        </section>

        <section className="v1-card" aria-label="Meest gestelde vragen">
          <SectionHead title="Meest gestelde vragen" link={{ href: '/voorbeeld/gesprekken?view=top-questions', label: 'Alles' }} />
          {top.length === 0 ? (
            <EmptyState>
              {m.scannedThisMonth === 0
                ? 'Nog geen vragen deze maand. Hier zie je straks wat bezoekers het vaakst vragen.'
                : 'Nog geen vraag is vaker gesteld deze maand.'}
            </EmptyState>
          ) : (
            <ol className="v1-ov-top">
              {top.map((q) => (
                <li key={q.question}>
                  <div className="v1-ov-top-head">
                    <span className="v1-ov-top-q">{q.question}</span>
                    <span className="v1-ov-top-n">{q.count}</span>
                  </div>
                  <div className="v1-bar" data-level={q.unanswered ? 'warn' : undefined} aria-hidden="true">
                    <span style={{ width: `${Math.max(4, Math.round((q.count / topMax) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <OnboardingTour tourKey="voorbeeld" autoStart={false} steps={TOUR_STEPS} setupChecklistVisible={showNextStep} />
    </div>
  );
}
