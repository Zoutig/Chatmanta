// V1 /app: Overzicht (spec 2026-10-07 §7.2 + bijlage A, rijen "Overzicht").
//
// Volgorde van boven naar beneden:
//   PageHeader (begroeting + status-pill, Rondleiding, "Bekijk chatbot")
//   → kritiek-blok (alleen als er iets kritiek is; één blok, punten samengevoegd)
//   → anders het volgende-stap-blok zolang de setup niet af is
//   → StatStrip (gesprekken, zelf beantwoord, contactverzoeken, kennisbronnen)
//   → twee kolommen: "Hier wist je chatbot het niet" + "Meest gestelde vragen"
//   → OnboardingTour (verborgen; start via de Rondleiding-knop)
//
// Auth-keten (ongewijzigd):
//   geen sessie → getSessionOrg → redirect /v1/login (NEXT_REDIRECT valt door)
//   wél lid     → org uit de sessie + chatbot → overzicht
//   geen lid    → AUTH_FORBIDDEN → "Geen toegang"
//
// Alle reads via de session-client (RLS); geen service-role.

import Link from 'next/link';
import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getV1OverviewMetrics, type V1OverviewMetrics } from '@/lib/v1/dashboard/metrics';
import { getShellCounts } from '@/lib/v1/dashboard/shell-counts';
import { criticalItems, getAttentionSignals } from '@/lib/v1/dashboard/attention';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { AttentionBlock, EmptyState, StatusPill } from '@/app/v1/_ui/feedback';
import { StatStrip, type Stat } from '@/app/v1/_ui/stat-strip';
import { List, ListRow, SectionHead } from '@/app/v1/_ui/list';
import { OnboardingTour, type TourStep } from '@/app/v1/_ui/tour';
import { getOrgChatbot } from './rag-config';
import { NextStep } from './_overview/next-step';
import { TourButton } from './_overview/tour-button';
import './_overview/overview.css';

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

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const QA_HREF = '/v1/app/kennisbank?tab=qa&prefillQuestion=';

// Rondleiding: selectors bestaan in de nieuwe schil en op dit scherm.
// '#setup-checklist' (het volgende-stap-blok) wordt door OnboardingTour
// weggefilterd als dat blok niet getoond wordt (setupChecklistVisible=false).
const TOUR_STEPS: TourStep[] = [
  { selector: null, placement: 'center', title: 'Welkom bij ChatManta', body: 'In een paar stappen zie je waar alles staat.' },
  {
    selector: '#v1-sidebar a[href="/v1/app/kennisbank"]',
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
    selector: '#v1-sidebar a[href="/v1/app/widget"]',
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

function buildStats(m: V1OverviewMetrics, contacts: { enabled: boolean; newCount: number }): Stat[] {
  const { deltaPct } = m.conversationsWeekDelta;
  const conversations: Stat = {
    label: 'Gesprekken',
    value: String(m.conversationsThisMonth.threads),
    sub: 'Deze maand',
    spark: m.conversationsTrend,
    href: '/v1/app/gesprekken',
  };
  if (deltaPct !== null) {
    conversations.delta = `${deltaPct > 0 ? '+' : ''}${deltaPct}% deze week`;
    conversations.deltaTone = deltaPct > 0 ? 'ok' : deltaPct < 0 ? 'warn' : 'neutral';
  }

  const h = m.helpfulness;
  const helped: Stat = {
    label: 'Zelf beantwoord',
    value: h.rate === null ? 'Nog geen' : `${h.rate}%`,
    sub: h.rate === null ? 'Nog geen gesprekken deze maand' : `${h.successful} van ${h.total} gesprekken`,
    info: 'Gesprekken waarin je chatbot een antwoord gaf zonder door te verwijzen. Over deze maand.',
  };

  const stats: Stat[] = [conversations, helped];

  if (contacts.enabled) {
    stats.push({
      label: 'Contactverzoeken',
      value: String(contacts.newCount),
      sub: contacts.newCount === 1 ? 'Nieuw verzoek' : 'Nieuwe verzoeken',
      href: '/v1/app/contactverzoeken',
    });
  }

  const s = m.sources;
  stats.push({
    label: 'Kennisbronnen',
    value: String(s.websitePages + s.documents + s.qaItems),
    sub: `${plural(s.websitePages, 'pagina', "pagina's")} · ${plural(s.documents, 'document', 'documenten')} · ${s.qaItems} Q&A`,
    href: '/v1/app/kennisbank',
  });
  return stats;
}

export default async function V1OverviewPage() {
  let session: Awaited<ReturnType<typeof getSessionOrg>>;
  try {
    session = await getSessionOrg();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <div className="v1-page">
          <PageHeader title="Geen toegang" description="Je bent geen lid van deze organisatie." />
        </div>
      );
    }
    throw e;
  }
  const { orgId } = session;

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);

  if (!chatbot) {
    return (
      <div className="v1-page">
        <PageHeader title="Overzicht" />
        <div className="v1-card">
          <EmptyState>Er is nog geen chatbot voor je ingesteld. Neem contact op met ChatManta.</EmptyState>
        </div>
      </div>
    );
  }

  const [m, counts, signals] = await Promise.all([
    getV1OverviewMetrics(supabase, orgId, chatbot.id),
    getShellCounts(supabase, orgId, chatbot.id),
    getAttentionSignals(supabase, orgId, chatbot.id),
  ]);

  const critical = criticalItems(signals);
  const widgetInstalled = m.widgetStatus !== 'not_installed';
  const allSetupDone = m.setup.hasDocument && m.setup.hasKnowledgeSource && m.setup.hasTraffic && widgetInstalled;
  // Rustregel 2 + §7.2: hooguit één blok bovenaan; kritiek gaat voor de volgende stap.
  const showNextStep = critical.length === 0 && !allSetupDone;
  // Bijlage A: "Gepauzeerd" hoort in de status-pill (metrics leidt pauze niet af).
  const status = signals.widgetPaused ? 'paused' : m.chatbotStatus;

  const stats = buildStats(m, {
    enabled: counts.contactRequestsEnabled,
    newCount: counts.contactRequestsNewCount,
  });
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
            <Link id="v1-ov-preview" href="/v1/app/preview" className={buttonClass({ variant: 'secondary' })}>
              Bekijk chatbot
            </Link>
          </>
        }
      />

      {critical.length === 1 ? (
        <AttentionBlock
          level="critical"
          title={critical[0].text}
          actions={
            <Link href={critical[0].href} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              {critical[0].action}
            </Link>
          }
        />
      ) : critical.length > 1 ? (
        <AttentionBlock
          level="critical"
          title={`${critical.length} dingen hebben je aandacht`}
          items={critical.map((c) => (
            <span key={c.text}>
              {c.text}{' '}
              <Link href={c.href} className="v1-link">
                {c.action}
              </Link>
            </span>
          ))}
        />
      ) : null}

      {showNextStep ? <NextStep setup={m.setup} widgetInstalled={widgetInstalled} /> : null}

      <StatStrip label="Cijfers deze maand" items={stats} />

      <div className="v1-ov-cols">
        <section className="v1-card v1-ov-card-list" aria-label="Hier wist je chatbot het niet">
          <SectionHead title="Hier wist je chatbot het niet" link={{ href: '/v1/app/gesprekken', label: 'Alle gesprekken' }} />
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
          <SectionHead title="Meest gestelde vragen" link={{ href: '/v1/app/gesprekken?view=top-questions', label: 'Alles' }} />
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

      <OnboardingTour tourKey={orgId} autoStart={false} steps={TOUR_STEPS} setupChecklistVisible={showNextStep} />
    </div>
  );
}
