// V0 Klantendashboard — overview metrics aggregator.
//
// Combineert echte data uit query_log/v0_threads/documents/website_pages (waar
// beschikbaar) met mock-data voor entiteiten die in V0 nog geen DB-tabel hebben
// (manual_qa_items, widget_settings).

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { listDocs } from '@/lib/v0/server/rag';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { getWebsiteState } from '@/lib/v0/server/crawler';
import { getOrgSettings } from './settings';
import { countUnansweredThreads } from './conversations';
import type {
  OverviewMetrics,
  UnansweredQuestion,
  SetupStep,
  ChatbotStatus,
  WidgetStatus,
} from '../types';

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// getOverviewMetrics — main aggregator voor scherm 1.
// ---------------------------------------------------------------------------
export async function getOverviewMetrics(orgSlug: OrgSlug): Promise<OverviewMetrics> {
  const orgId = KNOWN_ORGS[orgSlug].id;

  // Parallel fetches — niets is afhankelijk van iets anders. Widget- en Q&A-
  // counts uit getOrgSettings zodat overzicht klopt met wat de klant zojuist
  // in /instellingen of /kennisbank heeft opgeslagen (getOrgSettings merget
  // de DB-rij met de mock-defaults, dus geen breekend gedrag voor lege orgs).
  const [docs, unanswered, monthlyStats, websitePages, settings] = await Promise.all([
    listDocs(orgId).catch(() => []),
    countUnansweredThreads(orgSlug),
    countConversationsThisMonth(orgId),
    getWebsiteState(orgId).then((s) => s.pages).catch(() => []),
    getOrgSettings(orgSlug),
  ]);
  const qaItems = settings.qa;
  const widget = settings.widget;

  const widgetStatus: WidgetStatus = widget.isActive
    ? 'active'
    : widget.isInstalled
      ? 'detected'
      : 'not_installed';

  const hasAnySource = docs.length > 0 || websitePages.length > 0 || qaItems.length > 0;
  const chatbotStatus: ChatbotStatus = !hasAnySource
    ? 'concept'
    : widget.isActive
      ? 'live'
      : widget.isInstalled
        ? 'paused'
        : 'testing';

  return {
    chatbotStatus,
    widgetStatus,
    sources: {
      websitePages: websitePages.filter((p) => p.status === 'active').length,
      documents: docs.length,
      qaItems: qaItems.filter((q) => q.active).length,
    },
    conversationsThisMonth: monthlyStats,
    unansweredCount: unanswered.count,
    latestUnansweredAt: unanswered.latestUnansweredAt,
  };
}

/**
 * Tel alle query_log-rijen voor een org (alle tijd, alle kinds). Wordt
 * gebruikt om de "5 testvragen gesteld"-stap in de setup-checklist te kunnen
 * markeren als completed — die mag niet maandelijks resetten zoals
 * conversationsThisMonth.messages.
 */
export async function countMessagesAllTime(orgId: string): Promise<number> {
  try {
    const { count, error } = await sb()
      .from('query_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function countConversationsThisMonth(
  orgId: string,
): Promise<{ threads: number; messages: number }> {
  try {
    const since = startOfMonthIso();
    const [threadRes, msgRes] = await Promise.all([
      sb()
        .from('v0_threads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .gte('created_at', since),
      sb()
        .from('query_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', since),
    ]);
    return {
      threads: threadRes.count ?? 0,
      messages: msgRes.count ?? 0,
    };
  } catch {
    return { threads: 0, messages: 0 };
  }
}

// ---------------------------------------------------------------------------
// getUnansweredQuestions — top-N fallback-vragen voor Overzicht + Gesprekken.
// Groepeert op vraag-text (lowercase) en sorteert op recentste eerst.
// ---------------------------------------------------------------------------
export async function getUnansweredQuestions(
  orgSlug: OrgSlug,
  limit = 10,
  sinceDays = 30,
): Promise<UnansweredQuestion[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  try {
    const since = new Date();
    since.setDate(since.getDate() - (sinceDays - 1));
    since.setHours(0, 0, 0, 0);
    const { data, error } = await sb()
      .from('query_log')
      .select('question, created_at')
      .eq('organization_id', orgId)
      .eq('kind', 'fallback')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];

    const groups = new Map<string, { question: string; occurrences: number; lastSeenAt: string }>();
    for (const row of data) {
      const q = String(row.question ?? '').trim();
      if (!q) continue;
      const key = q.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.occurrences += 1;
      } else {
        groups.set(key, {
          question: q,
          occurrences: 1,
          lastSeenAt: String(row.created_at ?? ''),
        });
      }
    }
    return Array.from(groups.values())
      .sort((a, b) => b.occurrences - a.occurrences || b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// getSetupChecklist — afleidt de 6-stappen checklist uit huidige state.
//
// `settingsSaved` = klant heeft minimaal 1× iets opgeslagen in /instellingen
// of /widget (= row in v0_org_settings bestaat, `updated_at != null`). Zonder
// dit signaal bleef tone_of_voice eeuwig 'in_progress' zodra er content was —
// ook nadat de gebruiker de tone of voice keurig had ingesteld.
//
// `testMessagesCount` = aantal query_log-rijen voor deze org (alle paden:
// test-pagina én widget). `>= TEST_QUESTIONS_TARGET` → stap completed. Tussen
// 0 en target → 'in_progress'. Voor V0 hergebruiken we het bestaande messages-
// veld uit conversationsThisMonth omdat de test-pagina ook logt via logQuery.
// ---------------------------------------------------------------------------
const TEST_QUESTIONS_TARGET = 5;

export async function getSetupChecklist(
  orgSlug: OrgSlug,
  metrics: OverviewMetrics,
  opts?: { settingsSaved?: boolean; testMessagesCount?: number },
): Promise<SetupStep[]> {
  const hasWebsite = metrics.sources.websitePages > 0;
  const hasAnyContent = hasWebsite || metrics.sources.documents > 0 || metrics.sources.qaItems > 0;
  const widgetInstalled =
    metrics.widgetStatus === 'detected' || metrics.widgetStatus === 'active';
  const widgetActive = metrics.widgetStatus === 'active';
  const settingsSaved = opts?.settingsSaved === true;
  const testMessages = opts?.testMessagesCount ?? metrics.conversationsThisMonth.messages;
  const hasEnoughTestMessages = testMessages >= TEST_QUESTIONS_TARGET;
  const hasAnyTestMessages = testMessages > 0;

  const steps: SetupStep[] = [
    {
      id: 'add_website',
      title: 'Website toevoegen',
      status: hasWebsite ? 'completed' : 'todo',
      href: '/klantendashboard/kennisbank',
    },
    {
      id: 'verify_sources',
      title: 'Bronnen controleren',
      status: hasAnyContent ? 'completed' : 'todo',
      href: '/klantendashboard/kennisbank',
    },
    {
      id: 'tone_of_voice',
      title: 'Tone of voice instellen',
      status: settingsSaved ? 'completed' : hasAnyContent ? 'in_progress' : 'todo',
      href: '/klantendashboard/instellingen',
    },
    {
      id: 'test_questions',
      title: `${TEST_QUESTIONS_TARGET} testvragen stellen`,
      status: hasEnoughTestMessages
        ? 'completed'
        : hasAnyTestMessages || hasAnyContent
          ? 'in_progress'
          : 'todo',
      href: '/klantendashboard/test',
    },
    {
      id: 'install_widget',
      title: 'Widget plaatsen',
      status: widgetInstalled ? 'completed' : 'todo',
      href: '/klantendashboard/widget',
    },
    {
      id: 'go_live',
      title: 'Chatbot live zetten',
      status: widgetActive ? 'completed' : widgetInstalled ? 'in_progress' : 'todo',
      href: '/klantendashboard/widget',
    },
  ];
  return steps;
}
