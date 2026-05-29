// Admin Dashboard — klantdetail (MD §9). Centrale plek: header met status-badges +
// acties, tab-navigatie (?tab=), en per tab data uit bestaande modules + de
// admin-overlay. Org komt uit de route-param (niet de active-org cookie).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { getProfile } from '@/lib/controlroom/server/profiles';
import { getOrgSignals, type ControlRoomKlant } from '@/lib/controlroom/server/signals';
import { listConversations } from '@/lib/v0/klantendashboard/server/conversations';
import { getWebsiteSources } from '@/lib/v0/server/crawler';
import { listDocs } from '@/lib/v0/server/rag';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { getAllTimeUsage } from '@/lib/v0/server/log';
import { listOnboardingItems } from '@/lib/controlroom/server/onboarding';
import { getPrivacy } from '@/lib/controlroom/server/privacy';
import { detectPossiblePii } from '@/lib/controlroom/pii';
import { formatCostUsd, formatDateNL, formatRelativeNL } from '@/lib/controlroom/format';
import { MONTHLY_CONVERSATION_LIMITS, usageLimitStatus } from '@/lib/controlroom/usage-limits';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill } from '@/app/klantendashboard/components/ui/pill';
import { StatusBadge } from '@/app/klantendashboard/components/status-badge';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { TabsNav, type TabDef } from '@/app/klantendashboard/components/tabs';
import { MetricCard } from '../../components/metric-card';
import { CommercialBadge, HealthBadge, TechnicalBadge } from '../../components/badges';
import { ReloadButton } from '../../components/reload-button';
import { ProfileEditor } from './components/profile-editor';
import { NotesEditor } from './components/notes-editor';
import { PrivacyForm } from './components/privacy-form';
import { OnboardingChecklist } from './components/onboarding-checklist';
import { SourcesManager } from './components/sources-manager';
import { SettingsForm } from '@/app/klantendashboard/instellingen/components/settings-form';
import { WidgetForm } from '@/app/klantendashboard/widget/components/widget-form';
import {
  adminSaveChatbotSettingsAction,
  adminSaveWidgetSettingsAction,
  adminCheckWidgetInstallationAction,
} from '@/app/actions/controlroom';

export const dynamic = 'force-dynamic';

const TABS: TabDef[] = [
  { key: 'overzicht', label: 'Overzicht' },
  { key: 'botinstellingen', label: 'Botinstellingen' },
  { key: 'gesprekken', label: 'Gesprekken' },
  { key: 'bronnen', label: 'Bronnen' },
  { key: 'jobs', label: 'Crawls & Jobs' },
  { key: 'usage', label: 'Usage' },
  { key: 'widget', label: 'Widget' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'privacy', label: 'Privacy & Data' },
  { key: 'notities', label: 'Notities' },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="klant-section-title" style={{ marginBottom: 10 }}>{children}</div>;
}

function EmptyInline({ text }: { text: string }) {
  return <p style={{ fontSize: 13.5, color: 'var(--klant-dim)', margin: 0 }}>{text}</p>;
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--klant-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13.5, marginTop: 3, color: 'var(--klant-ink)' }}>{children}</div>
    </div>
  );
}

// ───────────────────────── Tabs ─────────────────────────

async function OverzichtTab({ slug, klant }: { slug: OrgSlug; klant: ControlRoomKlant }) {
  const limit = MONTHLY_CONVERSATION_LIMITS[klant.commercialStatus];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="klant-metrics-grid">
        <MetricCard label="Gesprekken (deze maand)" value={klant.conversationsThisMonth} sub={limit ? `limiet ${limit}` : 'onbeperkt'} />
        <MetricCard label="Onbeantwoord (30d)" value={klant.unansweredCount} tone={klant.unansweredCount > 0 ? 'warn' : 'ink'} />
        <MetricCard label="Fallback %" value={klant.fallbackPct == null ? '—' : `${klant.fallbackPct}%`} />
        <MetricCard label="Actieve bronnen" value={klant.sources.total} sub={`${klant.sources.websitePages} web · ${klant.sources.documents} docs · ${klant.sources.qaItems} Q&A`} />
        <MetricCard label="Kosten (deze maand)" value={formatCostUsd(klant.monthCostUsd)} sub="geschat, USD" />
      </div>

      <Card>
        <SectionTitle>Health</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <HealthBadge status={klant.health} />
          <TechnicalBadge status={klant.technicalStatus} />
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--klant-muted)' }}>
          {klant.healthReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle>Klantbeheer</SectionTitle>
        <ProfileEditor orgSlug={slug} profile={klant.profile} />
      </Card>

      <Card>
        <SectionTitle>Bot &amp; widget</SectionTitle>
        <EmptyInline text="Bot- en widgetinstellingen van deze klant bewerk je in de tabs Botinstellingen en Widget." />
      </Card>
    </div>
  );
}

async function GesprekkenTab({ slug }: { slug: OrgSlug }) {
  const convos = await listConversations(slug, 'last_30_days');
  if (convos.length === 0) return <Card><EmptyInline text="Nog geen gesprekken in de laatste 30 dagen." /></Card>;
  return (
    <Card padded={false}>
      <div style={{ overflowX: 'auto' }}>
        <table className="klant-table">
          <thead>
            <tr>
              <th>Laatste activiteit</th>
              <th>Eerste vraag</th>
              <th>Berichten</th>
              <th>Status</th>
              <th>Privacy</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {convos.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 12.5, color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}>{formatRelativeNL(c.lastActivityAt)}</td>
                <td style={{ fontSize: 13, maxWidth: 420 }}>
                  <Link href={`/admindashboard/klanten/${slug}/gesprek/${c.id}`} style={{ color: 'var(--klant-ink)', textDecoration: 'none', fontWeight: 500 }}>
                    {c.firstQuestion}
                  </Link>
                </td>
                <td style={{ fontSize: 13 }}>{c.messageCount}</td>
                <td><StatusBadge kind="conversation" status={c.status} /></td>
                <td>{detectPossiblePii(c.firstQuestion) ? <Pill tone="warn" dot>Mogelijk PII</Pill> : <span style={{ color: 'var(--klant-faint)', fontSize: 12 }}>—</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Link href={`/admindashboard/klanten/${slug}/gesprek/${c.id}`} className="klant-btn" data-variant="ghost" style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}>
                    Bekijk →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function BronnenTab({ slug, orgId }: { slug: OrgSlug; orgId: string }) {
  const [sources, docs, settings] = await Promise.all([
    getWebsiteSources(orgId).catch(() => []),
    listDocs(orgId).catch(() => []),
    getOrgSettings(slug).catch(() => null),
  ]);
  const qa = settings?.qa ?? [];
  return (
    <SourcesManager
      orgSlug={slug}
      sources={sources}
      docs={docs}
      qaActive={qa.filter((q) => q.active).length}
      qaTotal={qa.length}
    />
  );
}

async function JobsTab({ orgId }: { orgId: string }) {
  const sources = await getWebsiteSources(orgId).catch(() => []);
  const withJobs = sources.filter((s) => s.job);
  if (withJobs.length === 0) return <Card><EmptyInline text="Geen crawl-/verwerkingsjobs gevonden." /></Card>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {withJobs.map((s) => (
        <Card key={s.source.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{s.source.host ?? s.source.rootUrl}</span>
            <Pill tone={s.job!.status === 'failed' ? 'danger' : s.job!.status === 'completed' ? 'success' : 'info'} dot>{s.job!.status}</Pill>
            <span style={{ fontSize: 12, color: 'var(--klant-muted)' }}>{s.job!.completed}/{s.job!.total}</span>
          </div>
          {s.job!.error ? <p style={{ fontSize: 12.5, color: 'var(--klant-danger)', margin: '0 0 8px' }}>{s.job!.error}</p> : null}
          {s.job!.events.length > 0 ? (
            <table className="klant-table">
              <thead><tr><th>Event</th><th>Firecrawl</th><th>Voortgang</th><th>Beslissing</th><th>Wanneer</th></tr></thead>
              <tbody>
                {s.job!.events.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12.5 }}>{e.eventType}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>{e.firecrawlStatus ?? '—'}</td>
                    <td style={{ fontSize: 12.5 }}>{e.total != null ? `${e.completed ?? 0}/${e.total}` : '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>{e.decision ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--klant-dim)', whiteSpace: 'nowrap' }}>{formatRelativeNL(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

async function UsageTab({ klant, orgId }: { klant: ControlRoomKlant; orgId: string }) {
  const allTime = await getAllTimeUsage(orgId).catch(() => null);
  const us = usageLimitStatus(klant.conversationsThisMonth, klant.commercialStatus);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="klant-metrics-grid">
        <MetricCard label="Gesprekken deze maand" value={klant.conversationsThisMonth} sub={us.label} tone={us.tone} />
        <MetricCard label="Gesprekken deze week" value={klant.conversationsThisWeek} />
        <MetricCard label="Kosten deze maand" value={formatCostUsd(klant.monthCostUsd)} sub="geschat, USD" />
        <MetricCard label="Fallback %" value={klant.fallbackPct == null ? '—' : `${klant.fallbackPct}%`} />
      </div>
      {allTime ? (
        <Card>
          <SectionTitle>Sinds de start (all-time)</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <InfoItem label="Queries">{allTime.queryCount}</InfoItem>
            <InfoItem label="Totale kosten">{formatCostUsd(allTime.totalCostUsd)}</InfoItem>
            <InfoItem label="Tokens (totaal)">{allTime.totalTokens.toLocaleString('nl-NL')}</InfoItem>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

async function BotinstellingenTab({ slug }: { slug: OrgSlug }) {
  const settings = await getOrgSettings(slug).catch(() => null);
  if (!settings) return <Card><EmptyInline text="Kon de botinstellingen niet laden." /></Card>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="klant-hint" style={{ margin: 0 }}>
        Wijzigingen gelden direct voor de live bot én het klantendashboard van deze klant.
      </p>
      <SettingsForm
        initial={settings.chatbot}
        action={adminSaveChatbotSettingsAction.bind(null, slug)}
        showReset
      />
    </div>
  );
}

async function WidgetTab({ slug }: { slug: OrgSlug }) {
  const settings = await getOrgSettings(slug).catch(() => null);
  if (!settings) return <Card><EmptyInline text="Kon de widgetinstellingen niet laden." /></Card>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="klant-hint" style={{ margin: 0 }}>
        Embedcode, uiterlijk, live-status en toegestane domeinen — wijzigingen gelden direct voor deze klant.
      </p>
      <WidgetForm
        initial={settings.widget}
        chatbotName={settings.chatbot.chatbotName}
        welcomeMessage={settings.chatbot.welcomeMessage}
        orgSlug={slug}
        action={adminSaveWidgetSettingsAction.bind(null, slug)}
        checkAction={adminCheckWidgetInstallationAction.bind(null, slug)}
        demoHref={`/embed/${slug}`}
        showReset
      />
    </div>
  );
}

async function OnboardingTab({ slug, orgId }: { slug: OrgSlug; orgId: string }) {
  const items = await listOnboardingItems(orgId);
  return (
    <Card>
      <OnboardingChecklist orgSlug={slug} items={items} />
    </Card>
  );
}

async function PrivacyTab({ slug, orgId }: { slug: OrgSlug; orgId: string }) {
  const privacy = await getPrivacy(orgId);
  // delete_after = read-time projectie (created_at + retention); de daadwerkelijke
  // opschoning is een gedocumenteerde service, nog niet op cron.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <SectionTitle>Bewaartermijnen &amp; AVG</SectionTitle>
        <p className="klant-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          In V0 worden deze waarden opgeslagen en getoond. Het automatisch verwijderen/anonimiseren
          is een voorbereide service (nog niet op cron). Laatste export:{' '}
          {formatDateNL(privacy.lastDataExportAt)} · laatste verwijdering: {formatDateNL(privacy.lastDataDeletionAt)}.
        </p>
        <PrivacyForm orgSlug={slug} privacy={privacy} />
      </Card>
    </div>
  );
}

// ───────────────────────── Page ─────────────────────────

export default async function KlantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgSlug } = await params;
  if (!(orgSlug in KNOWN_ORGS)) notFound();
  const slug = orgSlug as OrgSlug;
  const orgId = KNOWN_ORGS[slug].id;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : 'overzicht';

  const profile = await getProfile(orgId);
  const klant = await getOrgSignals(slug, profile);

  return (
    <>
      <PageHead
        eyebrow={`Admin Dashboard · ${slug}`}
        title={klant.name}
        actions={
          <>
            <CommercialBadge status={klant.commercialStatus} />
            <TechnicalBadge status={klant.technicalStatus} />
            <HealthBadge status={klant.health} />
            <ReloadButton />
          </>
        }
      />

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <InfoItem label="Customer owner">{klant.profile.customerOwner}</InfoItem>
          <InfoItem label="Technical owner">{klant.profile.technicalOwner}</InfoItem>
          <InfoItem label="Laatste activiteit">{formatRelativeNL(klant.lastActivityAt)}</InfoItem>
          <InfoItem label="Laatste crawl">{klant.crawlStatus ?? 'n.v.t.'}</InfoItem>
          <InfoItem label="Widget"><StatusBadge kind="widget" status={klant.widgetStatus} /></InfoItem>
          <InfoItem label="Volgende actie">{klant.profile.nextAction ?? '—'}</InfoItem>
        </div>
      </Card>

      <TabsNav tabs={TABS} active={tab} basePath={`/admindashboard/klanten/${slug}`} />

      {tab === 'overzicht' && <OverzichtTab slug={slug} klant={klant} />}
      {tab === 'botinstellingen' && <BotinstellingenTab slug={slug} />}
      {tab === 'gesprekken' && <GesprekkenTab slug={slug} />}
      {tab === 'bronnen' && <BronnenTab slug={slug} orgId={orgId} />}
      {tab === 'jobs' && <JobsTab orgId={orgId} />}
      {tab === 'usage' && <UsageTab klant={klant} orgId={orgId} />}
      {tab === 'widget' && <WidgetTab slug={slug} />}
      {tab === 'onboarding' && <OnboardingTab slug={slug} orgId={orgId} />}
      {tab === 'privacy' && <PrivacyTab slug={slug} orgId={orgId} />}
      {tab === 'notities' && (
        <Card>
          <NotesEditor orgSlug={slug} notes={klant.profile.notes} />
        </Card>
      )}
    </>
  );
}
