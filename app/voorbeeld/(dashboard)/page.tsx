// Voorbeeld-dashboard: Overzicht. Kopie van app/v1/app/page.tsx met vaste
// voorbeeldcijfers (lib/voorbeeld/fixtures/overzicht.ts) in plaats van
// database-reads. De setup is af en er speelt niets kritieks, dus bovenaan
// staat geen blok. De cijferstrook is een client component (DemoStats) zodat
// hij de demo-instellingen van de bezoeker volgt.

import Link from 'next/link';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { EmptyState, StatusPill } from '@/app/v1/_ui/feedback';
import { SectionHead } from '@/app/v1/_ui/list';
import { OnboardingTour, type TourStep } from '@/app/klantendashboard/components/onboarding-tour';
import { DEMO_SHELL } from '@/lib/voorbeeld/fixtures/shell';
import { getFixtureOverviewMetrics } from '@/lib/voorbeeld/fixtures/overzicht';
import { NextStep } from './_overview/next-step';
import { TourButton } from './_overview/tour-button';
import { DemoStats } from './_overview/demo-stats';
import { OwnActivityCard } from './_overview/own-activity-card';
import { UnansweredList } from './_overview/unanswered-list';
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

// Rondleiding, alleen op de knop (autoStart uit): het demo-pad in plaats van
// de algemene V1-rondleiding. Selectors bestaan in de demo-schil en op dit scherm.
const TOUR_STEPS: TourStep[] = [
  {
    selector: null,
    placement: 'center',
    title: 'Zo werkt deze demo',
    body: 'Dit is het dashboard van een fictief vakantiepark. Alles wat je aanpast, bewaren we alleen in jouw browser. Probeer gerust van alles uit.',
  },
  {
    selector: '#vb-open-site',
    placement: 'bottom',
    title: 'Stel een vraag op de website',
    body: 'Open de voorbeeldwebsite en klik rechtsonder op de chat. De chatbot antwoordt echt, met de tekst van die website.',
  },
  {
    selector: '#v1-sidebar a[href="/voorbeeld/instellingen"]',
    placement: 'right',
    title: 'Verander hoe hij praat',
    body: 'Kies een andere toon, kortere antwoorden of een extra instructie. De chatbot op de website volgt het meteen.',
  },
  {
    selector: '#v1-sidebar a[href="/voorbeeld/widget"]',
    placement: 'right',
    title: 'Pas het uiterlijk aan',
    body: 'Kleur, positie en welkomsttekst van de chatknop. Ook dat zie je direct terug op de website.',
  },
  {
    selector: '#vb-unanswered',
    placement: 'right',
    title: 'Leer hem iets nieuws',
    body: 'Vraag op de website iets wat er niet staat. De vraag verschijnt hier. Klik op Antwoord geven, vul het antwoord in en vraag het opnieuw: nu weet hij het.',
  },
  {
    selector: '#v1-sidebar a[href="/voorbeeld/gesprekken"]',
    placement: 'right',
    title: 'Lees mee',
    body: 'Je eigen gesprekken staan bij Gesprekken, gemarkeerd met Jij. Een ingevuld contactformulier vind je bij Contactverzoeken.',
  },
  {
    selector: '#vb-contact',
    placement: 'bottom',
    title: 'Ook voor jouw website?',
    body: 'Mail ons gerust. We laten graag zien hoe dit er met jouw eigen website uitziet.',
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

      <OwnActivityCard />

      <div className="v1-ov-cols">
        <section id="vb-unanswered" className="v1-card v1-ov-card-list" aria-label="Hier wist je chatbot het niet">
          <SectionHead title="Hier wist je chatbot het niet" link={{ href: '/voorbeeld/gesprekken', label: 'Alle gesprekken' }} />
          <UnansweredList
            fixtureRows={unanswered.map((u) => ({
              question: u.question,
              meta: [`${u.occurrences} keer gevraagd`, shortDate(u.lastSeenAt)].filter(Boolean).join(' · '),
            }))}
          />
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
