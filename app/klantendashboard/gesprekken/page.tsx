// V0 Klantendashboard — Scherm 6: Gesprekken (lijst).
//
// Read uit v0_threads + v0_thread_messages voor de actieve org. Filters
// werken via ?filter=<key>. Status (answered/unanswered) afgeleid uit het
// laatste assistant-message.response.kind.

import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { listConversations } from '@/lib/v0/klantendashboard/server/conversations';
import {
  listNegativeFeedback,
  countRecentNegativeFeedback,
} from '@/lib/v0/klantendashboard/server/feedback';
import { getTopQuestions } from '@/lib/v0/klantendashboard/server/top-questions';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import type { ConversationFilter } from '@/lib/v0/klantendashboard/types';
import { PageHead } from '../components/ui/page-head';
import { StatusBadge } from '../components/status-badge';
import { Icon } from '../components/ui/icon';
import { TabsNav } from '../components/tabs';
import { FilterBar } from './components/filter-bar';
import { NegativeFeedbackTable } from './components/negative-feedback-table';
import { ReloadButton } from './components/reload-button';
import { TopQuestionsTab } from './components/top-questions-tab';

export const dynamic = 'force-dynamic';

const VALID_FILTERS: ConversationFilter[] = [
  'today',
  'last_7_days',
  'last_30_days',
  'unanswered',
  'negative_feedback',
];

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function GesprekkenPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; view?: string }>;
}) {
  const { filter: rawFilter, view: rawView } = await searchParams;
  const filter: ConversationFilter = VALID_FILTERS.includes(rawFilter as ConversationFilter)
    ? (rawFilter as ConversationFilter)
    : 'last_30_days';
  const view: 'gesprekken' | 'top-questions' =
    rawView === 'top-questions' ? 'top-questions' : 'gesprekken';

  const activeOrg = await getActiveOrgFromCookies();
  // Settings eerst — topQuestions config bepaalt de drempel en lijst-grootte
  // waarop getTopQuestions filtert. Daarna parallel de overige data-fetches
  // (incl. de negatieve-feedback lijst en banner-counter).
  const settings = await getOrgSettings(activeOrg.slug);
  const [items, topQuestions, negativeFeedback, recentNegativeCount] =
    await Promise.all([
      listConversations(activeOrg.slug, filter),
      getTopQuestions(activeOrg.slug, settings.topQuestions),
      listNegativeFeedback(activeOrg.slug),
      countRecentNegativeFeedback(activeOrg.slug, 7),
    ]);
  // Initial "✓ In Q&A"-badge: alles wat we al in v0_org_settings.qa hebben staan
  // (case-insensitive match op de vraag-text). Zonder dit zou de badge na page-
  // reload verdwijnen — savedKeys in TopQuestionsTab is alleen client-state.
  const existingQAQuestions = settings.qa
    .filter((q) => q.active)
    .map((q) => q.question);

  const unansweredCount = items.filter((x) => x.status === 'unanswered').length;

  return (
    <>
      <PageHead
        eyebrow="Gesprekken"
        title="Alle conversaties op één plek"
        subtitle="Filter op onbeantwoord om snel te zien waar je chatbot vastloopt — en los het direct op door kennis toe te voegen."
        actions={<ReloadButton />}
      />

      <TabsNav
        basePath="/klantendashboard/gesprekken"
        paramName="view"
        active={view}
        tabs={[
          { key: 'gesprekken', label: 'Alle gesprekken', count: items.length },
          { key: 'top-questions', label: 'Meest gestelde vragen', count: topQuestions.items.length },
        ]}
      />

      {view === 'top-questions' && (
        <TopQuestionsTab
          initial={topQuestions.items}
          totalUnique={topQuestions.totalUnique}
          config={settings.topQuestions}
          existingQAQuestions={existingQAQuestions}
        />
      )}
      {view === 'gesprekken' && <FilterBar active={filter} />}

      {view === 'gesprekken' && filter === 'negative_feedback' ? (
        <NegativeFeedbackTable items={negativeFeedback} />
      ) : view === 'gesprekken' && items.length === 0 ? (
        <div className="klant-empty">
          <div className="klant-empty-icon">
            <MessagesSquare size={26} strokeWidth={1.6} />
          </div>
          <h3 className="klant-empty-title">
            {filter === 'unanswered' ? 'Geen onbeantwoorde vragen' : 'Nog geen gesprekken'}
          </h3>
          <p className="klant-empty-sub">
            {filter === 'unanswered'
              ? 'Mooi! Op dit moment heeft je chatbot alle vragen beantwoord.'
              : 'Zodra je widget live staat, verschijnen hier de gesprekken van je bezoekers.'}
          </p>
        </div>
      ) : view === 'gesprekken' ? (
        <>
          {recentNegativeCount > 0 && filter !== 'negative_feedback' && (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 14px',
                background: 'var(--klant-danger-soft)',
                border: '1px solid var(--klant-danger-border)',
                borderRadius: 'var(--klant-r-md)',
                fontSize: 13,
                color: 'var(--klant-ink)',
              }}
            >
              <strong>{recentNegativeCount}</strong>{' '}
              {recentNegativeCount === 1 ? 'bezoeker gaf' : 'bezoekers gaven'} negatieve
              feedback in de laatste 7 dagen.{' '}
              <Link
                href="/klantendashboard/gesprekken?filter=negative_feedback"
                style={{ color: 'var(--klant-accent)' }}
              >
                Bekijk
              </Link>
            </div>
          )}
          {unansweredCount > 0 && filter !== 'unanswered' && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                background: 'var(--klant-warn-soft)',
                border: '1px solid var(--klant-warn-border)',
                borderRadius: 'var(--klant-r-md)',
                fontSize: 13,
                color: 'var(--klant-ink)',
              }}
            >
              <strong>{unansweredCount}</strong>{' '}
              {unansweredCount === 1 ? 'gesprek heeft' : 'gesprekken hebben'} een onbeantwoorde
              vraag.{' '}
              <Link
                href="/klantendashboard/gesprekken?filter=unanswered"
                style={{ color: 'var(--klant-accent)' }}
              >
                Bekijk
              </Link>
            </div>
          )}
          <div
            style={{
              background: 'var(--klant-surface)',
              border: '1px solid var(--klant-border)',
              borderRadius: 'var(--klant-r-lg)',
              boxShadow: 'var(--klant-shadow)',
              overflow: 'hidden',
            }}
          >
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((c, i) => (
                <li key={c.id} style={{ borderTop: i ? '1px solid var(--klant-border)' : 'none' }}>
                  <Link
                    href={`/klantendashboard/gesprekken/${c.id}`}
                    className="klant-convo-row"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: '13px 18px',
                      textDecoration: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          background: 'var(--klant-surface-muted)',
                          color: 'var(--klant-muted)',
                          border: '1px solid var(--klant-border)',
                          display: 'inline-grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon name="globe" size={11} />
                      </span>
                      <span style={{ fontSize: 12.5, color: 'var(--klant-ink)', fontWeight: 500 }}>
                        {c.visitorLabel || 'Bezoeker'}
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 11,
                          color: 'var(--klant-dim)',
                          fontFamily: 'var(--klant-font-mono)',
                        }}
                      >
                        {formatDateTime(c.lastActivityAt)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        color: 'var(--klant-ink)',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {c.firstQuestion}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusBadge status={c.status} kind="conversation" />
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 11,
                          color: 'var(--klant-dim)',
                          fontFamily: 'var(--klant-font-mono)',
                        }}
                      >
                        {c.messageCount} berichten
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </>
  );
}
