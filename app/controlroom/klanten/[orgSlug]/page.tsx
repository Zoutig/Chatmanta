// Control Room — klantdetail (MD §9). Centrale plek: header met status-badges +
// acties, tab-navigatie (?tab=), en per tab data uit bestaande modules + de
// admin-overlay. Org komt uit de route-param (niet de active-org cookie).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
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
import type { CommercialStatus } from '@/lib/controlroom/types';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill } from '@/app/klantendashboard/components/ui/pill';
import { StatusBadge } from '@/app/klantendashboard/components/status-badge';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { TabsNav, type TabDef } from '@/app/klantendashboard/components/tabs';
import { MetricCard } from '../../components/metric-card';
import { CopyButton } from '../../components/copy-button';
import { CommercialBadge, HealthBadge, TechnicalBadge } from '../../components/badges';
import { ProfileEditor } from './components/profile-editor';
import { NotesEditor } from './components/notes-editor';
import { PrivacyForm } from './components/privacy-form';
import { OnboardingChecklist } from './components/onboarding-checklist';

export const dynamic = 'force-dynamic';

const TABS: TabDef[] = [
  { key: 'overzicht', label: 'Overzicht' },
  { key: 'gesprekken', label: 'Gesprekken' },
  { key: 'bronnen', label: 'Bronnen' },
  { key: 'jobs', label: 'Crawls & Jobs' },
  { key: 'usage', label: 'Usage' },
  { key: 'widget', label: 'Widget' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'privacy', label: 'Privacy & Data' },
  { key: 'notities', label: 'Notities' },
];

// MD §16.3 — simpele maandelijkse gesprekslimieten (kostencontrole, niet
// commercieel perfect). internal_test = onbeperkt.
const MONTHLY_LIMITS: Record<CommercialStatus, number | null> = {
  trial: 100,
  active: 500,
  paused: 500,
  cancellation: 500,
  internal_test: null,
};

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
  const settings = await getOrgSettings(slug).catch(() => null);
  const limit = MONTHLY_LIMITS[klant.commercialStatus];
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

      {settings ? (
        <Card>
          <SectionTitle>Bot-instellingen (read-only)</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <InfoItem label="Botnaam">{settings.chatbot.chatbotName || '—'}</InfoItem>
            <InfoItem label="Tone of voice">{settings.chatbot.toneOfVoice}</InfoItem>
            <InfoItem label="Taal">{settings.chatbot.primaryLanguage}</InfoItem>
            <InfoItem label="Welkomstbericht">{settings.chatbot.welcomeMessage || '—'}</InfoItem>
            <InfoItem label="Fallbackbericht">{settings.chatbot.fallbackMessage || '—'}</InfoItem>
          </div>
          <p className="klant-hint" style={{ marginTop: 10 }}>
            Bewerken gebeurt in het klantendashboard van de org zelf — hier alleen ter controle.
          </p>
        </Card>
      ) : null}
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
            </tr>
          </thead>
          <tbody>
            {convos.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 12.5, color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}>{formatRelativeNL(c.lastActivityAt)}</td>
                <td style={{ fontSize: 13, maxWidth: 420 }}>{c.firstQuestion}</td>
                <td style={{ fontSize: 13 }}>{c.messageCount}</td>
                <td><StatusBadge kind="conversation" status={c.status} /></td>
                <td>{detectPossiblePii(c.firstQuestion) ? <Pill tone="warn" dot>Mogelijk PII</Pill> : <span style={{ color: 'var(--klant-faint)', fontSize: 12 }}>—</span>}</td>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <SectionTitle>Websites</SectionTitle>
        {sources.length === 0 ? (
          <EmptyInline text="Geen website-bronnen." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sources.map((s) => (
              <div key={s.source.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span style={{ flex: 1 }}>{s.source.host ?? s.source.rootUrl ?? '(onbekend)'}</span>
                <span style={{ color: 'var(--klant-muted)', fontSize: 12 }}>{s.pages.filter((p) => p.status === 'active').length} pagina&apos;s</span>
                <Pill tone={s.source.status === 'failed' ? 'danger' : s.source.status === 'ready' ? 'success' : 'info'} dot>{s.source.status}</Pill>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Documenten</SectionTitle>
        {docs.length === 0 ? (
          <EmptyInline text="Geen documenten." />
        ) : (
          <table className="klant-table">
            <thead><tr><th>Bestand</th><th>Status</th><th>Chunks</th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontSize: 13 }}>{d.filename}</td>
                  <td><StatusBadge kind="document" status={d.status === 'ready' ? 'ready' : d.status === 'failed' ? 'error' : 'processing'} /></td>
                  <td style={{ fontSize: 13 }}>{d.chunkCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <SectionTitle>Handmatige Q&amp;A</SectionTitle>
        {qa.length === 0 ? <EmptyInline text="Geen handmatige Q&A." /> : <EmptyInline text={`${qa.filter((q) => q.active).length} actieve van ${qa.length} Q&A-items.`} />}
      </Card>
    </div>
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
  const limit = MONTHLY_LIMITS[klant.commercialStatus];
  let limitLabel = 'Onbeperkt (intern)';
  let limitTone: 'ink' | 'warn' | 'danger' | 'success' = 'success';
  if (limit != null) {
    const pct = limit > 0 ? klant.conversationsThisMonth / limit : 0;
    if (pct >= 1) {
      limitLabel = `Limiet bereikt (${klant.conversationsThisMonth}/${limit})`;
      limitTone = 'danger';
    } else if (pct >= 0.8) {
      limitLabel = `Bijna vol (${klant.conversationsThisMonth}/${limit})`;
      limitTone = 'warn';
    } else {
      limitLabel = `${klant.conversationsThisMonth}/${limit}`;
      limitTone = 'ink';
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="klant-metrics-grid">
        <MetricCard label="Gesprekken deze maand" value={klant.conversationsThisMonth} sub={limitLabel} tone={limitTone} />
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

async function WidgetTab({ slug, klant }: { slug: OrgSlug; klant: ControlRoomKlant }) {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'www.chatmanta.nl';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const embed = `<script src="${origin}/widget.js" data-org="${slug}" defer></script>`;
  const settings = await getOrgSettings(slug).catch(() => null);
  const w = settings?.widget;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <SectionTitle>Status</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <StatusBadge kind="widget" status={klant.widgetStatus} />
          {w?.lastSeenAt ? <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>Laatst gezien: {formatRelativeNL(w.lastSeenAt)}</span> : null}
          {w?.installOrigin ? <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>Origin: {w.installOrigin}</span> : null}
        </div>
      </Card>
      <Card>
        <SectionTitle>Embedcode</SectionTitle>
        <pre
          style={{
            background: 'var(--klant-surface-muted)',
            border: '1px solid var(--klant-border)',
            borderRadius: 'var(--klant-r-md)',
            padding: 12,
            fontSize: 12.5,
            fontFamily: 'var(--klant-font-mono)',
            overflowX: 'auto',
            margin: '0 0 12px',
          }}
        >
          {embed}
        </pre>
        <div style={{ display: 'flex', gap: 8 }}>
          <CopyButton text={embed} label="Kopieer embedcode" />
          <Link href={`${origin}/embed/${slug}`} target="_blank" className="klant-btn">
            Open widget-preview
          </Link>
        </div>
      </Card>
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
        eyebrow={`Control Room · ${slug}`}
        title={klant.name}
        actions={
          <>
            <CommercialBadge status={klant.commercialStatus} />
            <TechnicalBadge status={klant.technicalStatus} />
            <HealthBadge status={klant.health} />
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

      <TabsNav tabs={TABS} active={tab} basePath={`/controlroom/klanten/${slug}`} />

      {tab === 'overzicht' && <OverzichtTab slug={slug} klant={klant} />}
      {tab === 'gesprekken' && <GesprekkenTab slug={slug} />}
      {tab === 'bronnen' && <BronnenTab slug={slug} orgId={orgId} />}
      {tab === 'jobs' && <JobsTab orgId={orgId} />}
      {tab === 'usage' && <UsageTab klant={klant} orgId={orgId} />}
      {tab === 'widget' && <WidgetTab slug={slug} klant={klant} />}
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
