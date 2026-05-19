// V0 Klantendashboard — overview metrics aggregator.
//
// Combineert echte data uit query_log/v0_threads/documents (waar beschikbaar)
// met mock-data voor entiteiten die in V0 nog geen DB-tabel hebben
// (website_pages, manual_qa_items, widget_settings).

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { listDocs } from '@/lib/v0/server/rag';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { getMockWebsitePages } from '../mock/website-pages';
import { getMockManualQA } from '../mock/manual-qa';
import { getMockWidgetSettings } from '../mock/widget-settings';
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

  // Parallel fetches — niets is afhankelijk van iets anders.
  const [docs, fallbackCount, monthlyStats, websitePages, qaItems] = await Promise.all([
    listDocs(orgId).catch(() => []),
    countFallbacksAllTime(orgId),
    countConversationsThisMonth(orgId),
    Promise.resolve(getMockWebsitePages(orgSlug)),
    Promise.resolve(getMockManualQA(orgSlug)),
  ]);

  const widget = getMockWidgetSettings(orgSlug);
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
    unansweredCount: fallbackCount,
  };
}

// ---------------------------------------------------------------------------
// Internal: tellers via query_log + v0_threads.
// ---------------------------------------------------------------------------
async function countFallbacksAllTime(orgId: string): Promise<number> {
  try {
    const { count, error } = await sb()
      .from('query_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('kind', 'fallback');
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
): Promise<UnansweredQuestion[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  try {
    const { data, error } = await sb()
      .from('query_log')
      .select('question, created_at')
      .eq('organization_id', orgId)
      .eq('kind', 'fallback')
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
// ---------------------------------------------------------------------------
export async function getSetupChecklist(
  orgSlug: OrgSlug,
  metrics: OverviewMetrics,
): Promise<SetupStep[]> {
  const hasWebsite = metrics.sources.websitePages > 0;
  const hasAnyContent = hasWebsite || metrics.sources.documents > 0 || metrics.sources.qaItems > 0;
  const hasConversations = metrics.conversationsThisMonth.threads > 0;
  const widgetInstalled =
    metrics.widgetStatus === 'detected' || metrics.widgetStatus === 'active';
  const widgetActive = metrics.widgetStatus === 'active';

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
      status: hasAnyContent ? 'in_progress' : 'todo',
      href: '/klantendashboard/instellingen',
    },
    {
      id: 'test_questions',
      title: '5 testvragen stellen',
      status: hasConversations ? 'completed' : hasAnyContent ? 'in_progress' : 'todo',
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
