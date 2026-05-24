// V0 Klantendashboard — Scherm 1: Overzicht.
//
// Server component, force-dynamic omdat alle data org-gescopt is via cookie en
// regelmatig wijzigt (nieuwe vragen, nieuwe docs). De data-wrappers in
// lib/v0/klantendashboard/server/metrics.ts halen echt waar mogelijk, mock
// waar nog geen tabel bestaat (widget, qa, website-pages).

import {
  Code2,
  FileText,
  Globe,
  HelpCircle,
  MessagesSquare,
  Sparkles,
} from 'lucide-react';
import { getActiveOrgFromCookies, KNOWN_ORGS } from '@/lib/v0/server/active-org';
import {
  countMessagesAllTime,
  getOverviewMetrics,
  getSetupChecklist,
  getUnansweredQuestions,
} from '@/lib/v0/klantendashboard/server/metrics';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { PageHeader } from './components/page-header';
import { MetricCard } from './components/metric-card';
import { StatusBadge } from './components/status-badge';
import { SetupChecklist } from './components/setup-checklist';
import { DismissibleBanner } from './components/dismissible-banner';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const orgId = KNOWN_ORGS[activeOrg.slug].id;
  const metrics = await getOverviewMetrics(activeOrg.slug);
  const [unanswered, settings, testMessages] = await Promise.all([
    getUnansweredQuestions(activeOrg.slug, 5),
    getOrgSettings(activeOrg.slug),
    countMessagesAllTime(orgId),
  ]);
  const checklist = await getSetupChecklist(activeOrg.slug, metrics, {
    settingsSaved: settings.updatedAt !== null,
    testMessagesCount: testMessages,
  });

  const hasAnySource =
    metrics.sources.websitePages + metrics.sources.documents + metrics.sources.qaItems > 0;

  return (
    <>
      <PageHeader
        title="Chatbot overzicht"
        subtitle="Beheer je chatbot, bronnen en widget vanaf één plek."
      />

      {/* Warnings — gestapeld. Elk wegklikbaar; de onbeantwoord-banner komt
          terug zodra count of latestUnansweredAt verandert (nieuwe gap). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
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
        {metrics.unansweredCount > 0 && (
          <DismissibleBanner
            dismissId="unanswered"
            signature={`${metrics.unansweredCount}:${metrics.latestUnansweredAt ?? ''}`}
            variant="info"
            title={
              metrics.unansweredCount === 1
                ? 'Er is 1 onbeantwoorde vraag'
                : `Er zijn ${metrics.unansweredCount} onbeantwoorde vragen`
            }
            message="Dit zijn gesprekken van de laatste 30 dagen waar je chatbot geen goed antwoord op had. Voeg kennis toe om ze te verhelpen."
            cta={{ label: 'Bekijken', href: '/klantendashboard/gesprekken?filter=unanswered' }}
          />
        )}
      </div>

      {/* Metrics grid */}
      <section style={{ marginBottom: 28 }}>
        <div className="klant-metrics-grid">
          <MetricCard
            title="Chatbotstatus"
            primary=""
            secondary={<StatusBadge status={metrics.chatbotStatus} />}
            icon={Sparkles}
            href="/klantendashboard/instellingen"
            cta="Instellingen bekijken"
            tone="accent"
          />
          <MetricCard
            title="Widgetstatus"
            primary=""
            secondary={<StatusBadge status={metrics.widgetStatus} kind="widget" />}
            icon={Code2}
            href="/klantendashboard/widget"
            cta={metrics.widgetStatus === 'not_installed' ? 'Widget installeren' : 'Widget beheren'}
            tone={metrics.widgetStatus === 'active' ? 'success' : 'neutral'}
          />
          <MetricCard
            title="Actieve bronnen"
            primary={String(
              metrics.sources.websitePages + metrics.sources.documents + metrics.sources.qaItems,
            )}
            secondary={
              <span>
                {metrics.sources.websitePages} pagina&apos;s · {metrics.sources.documents}{' '}
                documenten · {metrics.sources.qaItems} Q&amp;A
              </span>
            }
            icon={Globe}
            href="/klantendashboard/kennisbank"
            cta="Bronnen beheren"
          />
          <MetricCard
            title="Gesprekken deze maand"
            primary={String(metrics.conversationsThisMonth.threads)}
            secondary={
              metrics.conversationsThisMonth.messages > 0
                ? `${metrics.conversationsThisMonth.messages} berichten in totaal`
                : 'Nog geen gesprekken deze maand'
            }
            icon={MessagesSquare}
            href="/klantendashboard/gesprekken"
            cta="Gesprekken bekijken"
          />
          <MetricCard
            title="Onbeantwoorde vragen"
            primary={String(metrics.unansweredCount)}
            secondary={
              metrics.unansweredCount === 0
                ? 'Alle vragen tot nu toe beantwoord.'
                : 'Gesprekken (laatste 30 dagen) zonder goed antwoord.'
            }
            icon={HelpCircle}
            href="/klantendashboard/gesprekken?filter=unanswered"
            cta="Bekijk gesprekken"
            tone={metrics.unansweredCount > 0 ? 'warning' : 'neutral'}
          />
        </div>
      </section>

      {/* Two-column: checklist + recent unanswered.
          Onder 880px stapelt de section naar 1 kolom via .grid-2col-stack. */}
      <section className="grid-2col-stack">
        <SetupChecklist steps={checklist} />

        <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h3 className="klant-section-title">Veelvoorkomende onbeantwoorde vragen</h3>
            <p className="klant-section-help">
              Hier zie je wat je bezoekers vragen waar je chatbot nog geen antwoord op heeft.
            </p>
          </div>
          {unanswered.length === 0 ? (
            <div
              style={{
                padding: '24px 14px',
                textAlign: 'center',
                color: 'var(--klant-fg-muted)',
                fontSize: 14,
                background: 'var(--klant-surface)',
                borderRadius: 'var(--klant-r-md)',
                border: '1px dashed var(--klant-border)',
              }}
            >
              <FileText size={20} style={{ marginBottom: 6, opacity: 0.7 }} />
              <div>Geen onbeantwoorde vragen.</div>
              <div style={{ fontSize: 12, color: 'var(--klant-fg-dim)', marginTop: 4 }}>
                Zodra bezoekers vragen stellen die je chatbot niet kan beantwoorden, verschijnen ze hier.
              </div>
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {unanswered.map((u) => (
                <li
                  key={u.question}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--klant-surface)',
                    borderRadius: 'var(--klant-r-sm)',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--klant-fg)' }}>{u.question}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--klant-fg-dim)',
                      flexShrink: 0,
                    }}
                  >
                    {u.occurrences}× gesteld
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
