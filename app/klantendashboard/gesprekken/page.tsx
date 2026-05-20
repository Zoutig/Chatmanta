// V0 Klantendashboard — Scherm 6: Gesprekken (lijst).
//
// Read uit v0_threads + v0_thread_messages voor de actieve org. Filters
// werken via ?filter=<key>. Status (answered/unanswered) afgeleid uit het
// laatste assistant-message.response.kind.

import Link from 'next/link';
import { ArrowRight, MessagesSquare } from 'lucide-react';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { listConversations } from '@/lib/v0/klantendashboard/server/conversations';
import { getTopQuestions } from '@/lib/v0/klantendashboard/server/top-questions';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import type { ConversationFilter } from '@/lib/v0/klantendashboard/types';
import { PageHeader } from '../components/page-header';
import { StatusBadge } from '../components/status-badge';
import { TabsNav } from '../components/tabs';
import { FilterBar } from './components/filter-bar';
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
  const [items, topQuestions, settings] = await Promise.all([
    listConversations(activeOrg.slug, filter),
    getTopQuestions(activeOrg.slug, 20),
    getOrgSettings(activeOrg.slug),
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
      <PageHeader
        title="Gesprekken"
        subtitle="Hier zie je wat bezoekers aan je chatbot vragen — en waar je chatbot nog tekortschiet."
      />

      <TabsNav
        basePath="/klantendashboard/gesprekken"
        paramName="view"
        active={view}
        tabs={[
          { key: 'gesprekken', label: 'Alle gesprekken', count: items.length },
          { key: 'top-questions', label: 'Meest gestelde vragen', count: topQuestions.length },
        ]}
      />

      {view === 'top-questions' && (
        <TopQuestionsTab initial={topQuestions} existingQAQuestions={existingQAQuestions} />
      )}
      {view === 'gesprekken' && <FilterBar active={filter} />}

      {view === 'gesprekken' && items.length === 0 ? (
        <div className="klant-empty">
          <div className="klant-empty-icon">
            <MessagesSquare size={26} strokeWidth={1.6} />
          </div>
          <h3 className="klant-empty-title">
            {filter === 'unanswered'
              ? 'Geen onbeantwoorde vragen'
              : filter === 'negative_feedback'
                ? 'Nog geen negatieve feedback'
                : 'Nog geen gesprekken'}
          </h3>
          <p className="klant-empty-sub">
            {filter === 'unanswered'
              ? 'Mooi! Op dit moment heeft je chatbot alle vragen beantwoord.'
              : filter === 'negative_feedback'
                ? 'Bezoekers hebben nog geen negatieve feedback gegeven.'
                : 'Zodra je widget live staat, verschijnen hier de gesprekken van je bezoekers.'}
          </p>
        </div>
      ) : view === 'gesprekken' ? (
        <>
          {unansweredCount > 0 && filter !== 'unanswered' && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                background: 'var(--klant-warning-soft)',
                border: '1px solid rgba(251, 191, 36, 0.32)',
                borderRadius: 'var(--klant-r-md)',
                fontSize: 13,
                color: 'var(--klant-fg)',
              }}
            >
              <strong>{unansweredCount}</strong> {unansweredCount === 1 ? 'gesprek heeft' : 'gesprekken hebben'} een
              onbeantwoorde vraag.{' '}
              <Link
                href="/klantendashboard/gesprekken?filter=unanswered"
                style={{ color: 'var(--klant-accent)' }}
              >
                Bekijk
              </Link>
            </div>
          )}
          <div className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="klant-table">
              <thead>
                <tr>
                  <th>Eerste vraag</th>
                  <th>Berichten</th>
                  <th>Status</th>
                  <th>Datum</th>
                  <th style={{ textAlign: 'right' }}>Actie</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/klantendashboard/gesprekken/${c.id}`}
                        style={{
                          color: 'var(--klant-fg)',
                          textDecoration: 'none',
                          fontWeight: 500,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {c.firstQuestion}
                      </Link>
                    </td>
                    <td style={{ color: 'var(--klant-fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {c.messageCount}
                    </td>
                    <td>
                      <StatusBadge status={c.status} kind="conversation" />
                    </td>
                    <td style={{ color: 'var(--klant-fg-muted)' }}>{formatDateTime(c.startedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/klantendashboard/gesprekken/${c.id}`}
                        className="klant-btn"
                        data-variant="ghost"
                        style={{ textDecoration: 'none' }}
                      >
                        Bekijken <ArrowRight size={13} strokeWidth={1.7} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
