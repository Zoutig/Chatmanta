// V1 admin — cross-org overzicht: alle klanten + samengevatte kaarten +
// aandachtslijsten voor de V1 admin landing page.
//
// Port van lib/controlroom/server/(overview|signals|usage|profiles|errors).ts:
//  - KNOWN_ORGS → query op organizations (deleted_at IS NULL) via getJorionAdminClient()
//  - v0_threads → threads, query_log.cost_usd → cost_eur
//  - Geen v0_org_settings: widgetStatus uit chatbots-heartbeat (migr 0023) met
//    organizations.allowed_domains als fallback-proxy
//  - Geen website_pages: gecrawlde pagina's = documents met source_url NOT NULL
//  - Profile-laag inline (profiles.ts trekt V0-sb() mee via module-side-effect)

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getFirecrawlAccountUsage } from '@/lib/v0/crawler/firecrawl';
import { deriveHealth, deriveTechnicalStatus } from '@/lib/controlroom/server/health';
import type { OrgSignals } from '@/lib/controlroom/server/health';
import {
  PROFILE_DEFAULTS,
  type AdminOrgProfile,
  type CommercialStatus,
  type HealthStatus,
  type OnboardingPhase,
  type Owner,
  type TechnicalStatus,
} from '@/lib/controlroom/types';

// ---------------------------------------------------------------------------
// Geëxporteerde types
// ---------------------------------------------------------------------------

/** Per-org snapshot voor de V1 admin overview. Variant van V0 ControlRoomKlant:
 *  slug is plain string (geen OrgSlug-union); kosten in EUR (niet USD). */
export type ControlRoomKlant = {
  orgId: string;
  slug: string;
  name: string;
  profile: AdminOrgProfile;
  commercialStatus: CommercialStatus;
  technicalStatus: TechnicalStatus;
  health: HealthStatus;
  healthReasons: string[];
  widgetStatus: 'active' | 'detected' | 'not_installed';
  sources: { websitePages: number; documents: number; qaItems: number; total: number };
  conversationsThisWeek: number;
  conversationsThisMonth: number;
  unansweredCount: number;
  fallbackPct: number | null;
  crawlStatus: 'completed' | 'failed' | 'processing' | 'pending' | null;
  crawlAnyFailed: boolean;
  crawlError: string | null;
  /** Maandkosten in EUR — V1 logt cost_eur, niet cost_usd. */
  monthCostEur: number;
  lastActivityAt: string | null;
};

export type OverviewSummary = {
  totalCustomers: number;
  activeCustomers: number;
  trials: number;
  withErrors: number;
  needAttention: number;
  crawlsRunning: number;
  crawlsFailed: number;
  conversationsThisWeek: number;
  conversationsThisMonth: number;
  monthCostEur: number;
  // Aandachtslijsten
  attention: ControlRoomKlant[];
  failedCrawls: ControlRoomKlant[];
  noRecentActivity: ControlRoomKlant[];
  widgetNotLive: ControlRoomKlant[];
  withUnanswered: ControlRoomKlant[];
};

export type DailyCostPointEur = { date: string; dayLabel: string; costEur: number };

// ---------------------------------------------------------------------------
// Datum-helpers — inline omdat usage.ts V0-sb() als module-side-effect trekt
// ---------------------------------------------------------------------------

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Maandag-gebaseerde week-start (spiegelt V0-conventie). */
function startOfWeekIso(weeksAgo = 0): string {
  const d = new Date();
  const isoDow = (d.getDay() + 6) % 7; // 0 = maandag
  d.setDate(d.getDate() - isoDow - weeksAgo * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Profile-laag — inline variant van profiles.ts (zonder V0-sb() side-effect)
// ---------------------------------------------------------------------------

type ProfileRow = {
  organization_id: string;
  commercial_status: string;
  technical_status_override: string | null;
  onboarding_phase: string;
  customer_owner: string;
  technical_owner: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_owner: string | null;
  next_action_due_date: string | null;
  created_at: string;
  updated_at: string;
};

function rowToProfile(r: ProfileRow): AdminOrgProfile {
  return {
    organizationId: r.organization_id,
    commercialStatus: r.commercial_status as CommercialStatus,
    technicalStatusOverride: (r.technical_status_override as TechnicalStatus | null) ?? null,
    onboardingPhase: r.onboarding_phase as OnboardingPhase,
    customerOwner: r.customer_owner as Owner,
    technicalOwner: r.technical_owner as Owner,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    notes: r.notes,
    nextAction: r.next_action,
    nextActionOwner: (r.next_action_owner as Owner | null) ?? null,
    nextActionDueDate: r.next_action_due_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function defaultProfile(orgId: string): AdminOrgProfile {
  return {
    organizationId: orgId,
    commercialStatus: PROFILE_DEFAULTS.commercialStatus,
    technicalStatusOverride: null,
    onboardingPhase: PROFILE_DEFAULTS.onboardingPhase,
    customerOwner: PROFILE_DEFAULTS.customerOwner,
    technicalOwner: PROFILE_DEFAULTS.technicalOwner,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    notes: null,
    nextAction: null,
    nextActionOwner: null,
    nextActionDueDate: null,
    createdAt: '',
    updatedAt: '',
  };
}

/** Batch-read admin_org_profile over alle org-ids; ontbrekende orgs krijgen een
 *  virtuele default (read-first, geen write nodig voor weergave). */
async function getProfilesMap(
  admin: SupabaseClient,
  orgIds: string[],
): Promise<Map<string, AdminOrgProfile>> {
  const map = new Map<string, AdminOrgProfile>();
  for (const id of orgIds) map.set(id, defaultProfile(id));
  if (orgIds.length === 0) return map;
  const { data } = await admin
    .from('admin_org_profile')
    .select('*')
    .in('organization_id', orgIds);
  for (const r of data ?? []) {
    map.set((r as ProfileRow).organization_id, rowToProfile(r as ProfileRow));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Crawl-samenvatting — V1 leest knowledge_sources.status
// (V0 leest processing_jobs via getWebsiteSources)
// ---------------------------------------------------------------------------

/** Vat de kennis-bronnen samen tot één crawl-status, analog aan V0's summarizeCrawl.
 *  Mapping: 'crawling' → 'processing', 'ready' → 'completed' (CrawlJobStatus-parity). */
function summarizeSources(rows: Array<{ status: string }>): {
  crawlStatus: ControlRoomKlant['crawlStatus'];
  crawlAnyFailed: boolean;
} {
  if (rows.length === 0) return { crawlStatus: null, crawlAnyFailed: false };
  let anyFailed = false;
  let anyRunning = false;
  let anyPending = false;
  for (const r of rows) {
    if (r.status === 'failed') anyFailed = true;
    if (r.status === 'crawling') anyRunning = true;
    if (r.status === 'pending') anyPending = true;
  }
  const crawlStatus: ControlRoomKlant['crawlStatus'] = anyRunning
    ? 'processing'
    : anyFailed
      ? 'failed'
      : anyPending
        ? 'pending'
        : 'completed';
  return { crawlStatus, crawlAnyFailed: anyFailed };
}

// ---------------------------------------------------------------------------
// Per-org signalen ophalen
// ---------------------------------------------------------------------------

async function getOrgSignals(
  admin: SupabaseClient,
  org: { id: string; name: string; slug: string },
  profile: AdminOrgProfile,
): Promise<ControlRoomKlant> {
  const monthIso = startOfMonthIso();
  const weekIso = startOfWeekIso(0);
  const days30Iso = daysAgoIso(30);
  const h24Iso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ponytail: alle reads parallel — 14 head-counts per org, elk goedkoop.
  const [
    sourcesRes,
    uploadedDocRes,
    crawledDocRes,
    qaRes,
    threadsMonthRes,
    threadsWeekRes,
    qlTotalRes,
    qlFbMonthRes,
    qlFb30Res,
    monthlyCostRes,
    lastActRes,
    recentErrRes,
    crawlErrRes,
    orgDomainsRes,
    chatbotLifecycleRes,
  ] = await Promise.all([
    // Kennisbronnen — status voor crawl-samenvatting
    admin.from('knowledge_sources').select('status').eq('organization_id', org.id).is('deleted_at', null),
    // Geüploade documenten (source_url = null → geen crawler-pagina)
    admin.from('documents').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).is('source_url', null).eq('included', true).is('deleted_at', null),
    // Gecrawlde pagina's — documents mét source_url (geen aparte website_pages-tabel in V1)
    admin.from('documents').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).not('source_url', 'is', null).eq('included', true).is('deleted_at', null),
    // Q&A-items
    admin.from('org_qa_items').select('id', { count: 'exact', head: true }).eq('organization_id', org.id),
    // Threads (= gesprekken) deze kalendermaand
    admin.from('threads').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).gte('created_at', monthIso),
    // Threads deze week (maandag-gebaseerd)
    admin.from('threads').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).gte('created_at', weekIso),
    // Totaal query_log-rijen deze maand (noemer voor fallback-%)
    admin.from('query_log').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).gte('created_at', monthIso),
    // Fallback-vragen deze maand (teller voor fallback-%)
    admin.from('query_log').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).eq('kind', 'fallback').gte('created_at', monthIso),
    // Fallback-vragen laatste 30 dagen — proxy voor "onbeantwoorde vragen"
    admin.from('query_log').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).eq('kind', 'fallback').gte('created_at', days30Iso),
    // Maandkosten in EUR (query_log.cost_eur — V1 factureert in EUR)
    admin.from('query_log').select('cost_eur').eq('organization_id', org.id).gte('created_at', monthIso).limit(20_000),
    // Laatste activiteit: recentste query_log-rij
    admin.from('query_log').select('created_at').eq('organization_id', org.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    // Recente kritieke fouten (admin_error_groups, 24u — zelfde tabel als V0 migr 0019)
    admin.from('admin_error_groups').select('id', { count: 'exact', head: true }).eq('organization_id', org.id).eq('status', 'open').eq('severity', 'error').gte('last_seen_at', h24Iso),
    // Crawl-foutbericht: recentste mislukte processing_job
    admin.from('processing_jobs').select('error_message').eq('organization_id', org.id).eq('status', 'failed').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    // Widget-status: allowed_domains als proxy (V1 heeft geen v0_org_settings.widget.isActive)
    admin.from('organizations').select('allowed_domains').eq('id', org.id).maybeSingle(),
    // Widget-levenscyclus (migr 0023): heartbeat + klant-toggle op de actieve chatbot
    admin.from('chatbots').select('is_active, widget_last_seen_at').eq('organization_id', org.id).is('deleted_at', null).order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ]);

  // ── Crawl-status samenvatten ──────────────────────────────────────────────
  const { crawlStatus, crawlAnyFailed } = summarizeSources(
    (sourcesRes.data ?? []) as Array<{ status: string }>,
  );
  const crawlError =
    (crawlErrRes.data as { error_message: string | null } | null)?.error_message ?? null;

  // ── Bronnen tellen ────────────────────────────────────────────────────────
  const websitePages = crawledDocRes.count ?? 0;
  const documents = uploadedDocRes.count ?? 0;
  const qaItems = qaRes.count ?? 0;
  const sources = { websitePages, documents, qaItems, total: websitePages + documents + qaItems };

  // ── Widget-status ──────────────────────────────────────────────────────────
  // WP2 (migr 0023): heartbeat-gebaseerd. 'active' = ping gezien én klant-toggle aan;
  // ping gezien maar gepauzeerd → 'detected' (geïnstalleerd, niet live); geen ping
  // maar wel allowed_domains → 'detected' (geconfigureerd); anders 'not_installed'.
  const orgData = orgDomainsRes.data as { allowed_domains: string[] | null } | null;
  const lifecycle = chatbotLifecycleRes.data as
    | { is_active: boolean; widget_last_seen_at: string | null }
    | null;
  const widgetStatus: ControlRoomKlant['widgetStatus'] = lifecycle?.widget_last_seen_at
    ? lifecycle.is_active !== false
      ? 'active'
      : 'detected'
    : (orgData?.allowed_domains?.length ?? 0) > 0
      ? 'detected'
      : 'not_installed';

  // ── Fallback-% en onbeantwoorde vragen ────────────────────────────────────
  const qlTotal = qlTotalRes.count ?? 0;
  const qlFbMonth = qlFbMonthRes.count ?? 0;
  const fallbackPct = qlTotal > 0 ? Math.round((qlFbMonth / qlTotal) * 100) : null;
  const unansweredCount = qlFb30Res.count ?? 0;

  // ── Maandkosten (EUR) ─────────────────────────────────────────────────────
  const monthCostEur = (monthlyCostRes.data ?? []).reduce(
    (acc, r) => acc + (Number((r as { cost_eur: number | null }).cost_eur) || 0),
    0,
  );

  // ── Laatste activiteit ────────────────────────────────────────────────────
  const lastActivityAt =
    (lastActRes.data as { created_at: string } | null)?.created_at ?? null;

  // ── Health afleiden via de pure functies uit health.ts ────────────────────
  const signals: OrgSignals = {
    hasActiveSources: sources.total > 0,
    sourceCount: sources.total,
    widgetStatus,
    crawlLatestStatus: crawlStatus,
    crawlAnyFailed,
    fallbackPct,
    conversationsThisMonth: threadsMonthRes.count ?? 0,
    conversationsThisWeek: threadsWeekRes.count ?? 0,
    recentCriticalErrorCount: recentErrRes.count ?? 0,
  };

  const technicalStatus = deriveTechnicalStatus(signals, profile.technicalStatusOverride);
  const health = deriveHealth(signals, technicalStatus, profile.commercialStatus);

  return {
    orgId: org.id,
    slug: org.slug,
    name: org.name,
    profile,
    commercialStatus: profile.commercialStatus,
    technicalStatus,
    health: health.status,
    healthReasons: health.reasons,
    widgetStatus,
    sources,
    conversationsThisWeek: threadsWeekRes.count ?? 0,
    conversationsThisMonth: threadsMonthRes.count ?? 0,
    unansweredCount,
    fallbackPct,
    crawlStatus,
    crawlAnyFailed,
    crawlError,
    monthCostEur,
    lastActivityAt,
  };
}

// ---------------------------------------------------------------------------
// Publieke API
// ---------------------------------------------------------------------------

/** Haalt alle V1-organisaties op en berekent per org de live-signalen.
 *  Gebruikt één gedeelde admin-client (cross-org service-role NÁ requireJorionAdmin).
 *  Gooit door bij auth-fouten — de RSC-caller handelt AUTH_FORBIDDEN af. */
export async function getControlRoomKlanten(): Promise<ControlRoomKlant[]> {
  const admin = await getJorionAdminClient();

  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name, slug')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  const orgList = (orgs ?? []) as Array<{ id: string; name: string; slug: string }>;
  if (orgList.length === 0) return [];

  const profiles = await getProfilesMap(admin, orgList.map((o) => o.id));

  // Fan-out: per-org parallel, fail-safe (één mislukte org legt het overzicht niet plat).
  const klanten = await Promise.all(
    orgList.map((o) =>
      getOrgSignals(admin, o, profiles.get(o.id) ?? defaultProfile(o.id)).catch(
        (err): ControlRoomKlant => {
          console.error(`[v1/admin/overview] getOrgSignals faalde voor org ${o.id}:`, err);
          const profile = profiles.get(o.id) ?? defaultProfile(o.id);
          return {
            orgId: o.id,
            slug: o.slug,
            name: o.name,
            profile,
            commercialStatus: profile.commercialStatus,
            technicalStatus: 'error',
            health: 'red',
            healthReasons: ['Data ophalen mislukt'],
            widgetStatus: 'not_installed',
            sources: { websitePages: 0, documents: 0, qaItems: 0, total: 0 },
            conversationsThisWeek: 0,
            conversationsThisMonth: 0,
            unansweredCount: 0,
            fallbackPct: null,
            crawlStatus: null,
            crawlAnyFailed: false,
            crawlError: null,
            monthCostEur: 0,
            lastActivityAt: null,
          };
        },
      ),
    ),
  );

  return klanten;
}

const HEALTH_RANK = { red: 0, orange: 1, green: 2 } as const;
const NO_ACTIVITY_DAYS = 14;

function isStale(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return true;
  const t = new Date(lastActivityAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > NO_ACTIVITY_DAYS * 86_400_000;
}

/** PURE: vat de klanten-lijst samen tot kaart-cijfers + gesorteerde
 *  aandachtslijsten. Spiegelt V0's buildOverviewSummary; kosten in EUR. */
export function buildOverviewSummary(klanten: ControlRoomKlant[]): OverviewSummary {
  const byHealth = [...klanten].sort(
    (a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health],
  );
  return {
    totalCustomers: klanten.length,
    activeCustomers: klanten.filter((k) => k.commercialStatus === 'active').length,
    trials: klanten.filter((k) => k.commercialStatus === 'trial').length,
    withErrors: klanten.filter((k) => k.health === 'red').length,
    needAttention: klanten.filter((k) => k.health !== 'green').length,
    crawlsRunning: klanten.filter(
      (k) => k.crawlStatus === 'processing' || k.crawlStatus === 'pending',
    ).length,
    crawlsFailed: klanten.filter((k) => k.crawlAnyFailed).length,
    conversationsThisWeek: klanten.reduce((a, k) => a + k.conversationsThisWeek, 0),
    conversationsThisMonth: klanten.reduce((a, k) => a + k.conversationsThisMonth, 0),
    monthCostEur: klanten.reduce((a, k) => a + k.monthCostEur, 0),
    attention: byHealth.filter((k) => k.health !== 'green'),
    failedCrawls: klanten.filter((k) => k.crawlAnyFailed),
    noRecentActivity: klanten.filter((k) => isStale(k.lastActivityAt)),
    widgetNotLive: klanten.filter(
      (k) =>
        (k.commercialStatus === 'active' || k.commercialStatus === 'trial') &&
        k.widgetStatus !== 'active',
    ),
    withUnanswered: klanten
      .filter((k) => k.unansweredCount > 0)
      .sort((a, b) => b.unansweredCount - a.unansweredCount),
  };
}

const MAX_COST_ROWS = 20_000;

/** Dagelijks klant-chatbot-verbruik (EUR) over de huidige kalendermaand, over
 *  álle V1-orgs samen. Bron = query_log.cost_eur (V1 factureert in EUR).
 *  Eén read, geen org-fan-out. Fail-safe → lege dag-reeks bij DB-fout. */
export async function getDailyCostThisMonth(): Promise<{
  points: DailyCostPointEur[];
  totalEur: number;
}> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const today = new Date();

  // Bouw de dag-buckets dag 1 t/m vandaag, lege dagen op 0.
  const points: DailyCostPointEur[] = [];
  const indexByKey = new Map<string, number>();
  for (
    const cursor = new Date(start);
    cursor <= today;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const key = dateKey(cursor);
    indexByKey.set(key, points.length);
    points.push({ date: key, dayLabel: String(cursor.getDate()), costEur: 0 });
  }

  try {
    const admin = await getJorionAdminClient();
    const { data, error } = await admin
      .from('query_log')
      .select('created_at, cost_eur')
      .gte('created_at', start.toISOString())
      .limit(MAX_COST_ROWS);
    if (error || !data) return { points, totalEur: 0 };
    let total = 0;
    for (const r of data) {
      const cost = Number((r as { cost_eur: number | null }).cost_eur) || 0;
      total += cost;
      const i = indexByKey.get(
        dateKey(new Date((r as { created_at: string }).created_at)),
      );
      if (i != null) points[i].costEur += cost;
    }
    return { points, totalEur: total };
  } catch {
    return { points, totalEur: 0 };
  }
}

// ---------------------------------------------------------------------------
// Firecrawl-credits — account-global (live API, bron-van-waarheid) met een
// V1-DB-fallback-schatting uit firecrawl_credit_log + crawl_events. Credits zijn
// een account-brede teller (zelfde Firecrawl-key als V0), niet per-org of EUR.
// ---------------------------------------------------------------------------

export type FirecrawlCreditUsage = {
  used: number;
  limit: number;
  remaining: number | null;
  pct: number;
  tone: 'ink' | 'warn' | 'danger';
  source: 'firecrawl' | 'estimate';
};

const FIRECRAWL_MONTHLY_LIMIT = Number(process.env.FIRECRAWL_MONTHLY_CREDIT_LIMIT) || 1000;

function creditTone(pct: number): FirecrawlCreditUsage['tone'] {
  return pct >= 90 ? 'danger' : pct >= 80 ? 'warn' : 'ink';
}

export async function getMonthlyFirecrawlCredits(): Promise<FirecrawlCreditUsage> {
  const limit = FIRECRAWL_MONTHLY_LIMIT;

  // 1. Bron-van-waarheid: live Firecrawl account-usage (account-global; zelfde
  //    key als V0). Kost geen credits; valt safe terug op de schatting.
  const live = await getFirecrawlAccountUsage().catch(() => null);
  if (live && live.usedThisPeriod != null && live.planCredits != null && live.planCredits > 0) {
    const pct = Math.round((live.usedThisPeriod / live.planCredits) * 100);
    return {
      used: live.usedThisPeriod,
      limit: live.planCredits,
      remaining: live.remainingCredits,
      pct,
      tone: creditTone(pct),
      source: 'firecrawl',
    };
  }

  // 2. Fallback-schatting uit V1's eigen logs deze maand: map/sitemap/scrape uit
  //    firecrawl_credit_log + batch-crawls (per job de hoogste credits_used).
  try {
    const admin = await getJorionAdminClient();
    const since = startOfMonthIso();
    const { data: logRows } = await admin
      .from('firecrawl_credit_log')
      .select('credits')
      .gte('created_at', since);
    const logSum = (logRows ?? []).reduce(
      (a, r) => a + (((r as { credits: number | null }).credits) ?? 0),
      0,
    );
    const { data: evRows } = await admin
      .from('crawl_events')
      .select('processing_job_id, credits_used')
      .gte('created_at', since);
    const maxByJob = new Map<string, number>();
    for (const r of evRows ?? []) {
      const c = (r as { credits_used: number | null }).credits_used ?? null;
      if (c == null) continue;
      const jid = (r as { processing_job_id: string | null }).processing_job_id ?? `none-${maxByJob.size}`;
      if (c > (maxByJob.get(jid) ?? 0)) maxByJob.set(jid, c);
    }
    const batchSum = [...maxByJob.values()].reduce((a, c) => a + c, 0);
    const used = logSum + batchSum;
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    return { used, limit, remaining: live?.remainingCredits ?? null, pct, tone: creditTone(pct), source: 'estimate' };
  } catch {
    return { used: 0, limit, remaining: null, pct: 0, tone: 'ink', source: 'estimate' };
  }
}
