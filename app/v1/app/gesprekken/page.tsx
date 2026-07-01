// V1 Klantendashboard — Gesprekken (lijst). Faithful port van V0's structuur:
// 5 filterpillen (incl. negative_feedback), DANGER-banner voor recente negatieve
// feedback, WARN-banner voor onbeantwoorde vragen, ReloadButton in PageHead.
//
// Read-only. Auth-keten: getSessionOrg → AUTH_FORBIDDEN / NEXT_REDIRECT.
// Alle reads onder de session-client (RLS). Geen TabsNav: "Meest gestelde vragen"
// is een latere fase — voeg een <TabsNav> toe met view='gesprekken'|'top-questions'
// en een <view === 'top-questions'> block wanneer die fase landt.

import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import {
  listV1Conversations,
  listV1NegativeFeedback,
  countRecentNegativeFeedback,
  type V1ConversationFilter,
} from '@/lib/v1/dashboard/conversations';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { StatusBadge } from '@/app/klantendashboard/components/status-badge';
import { Icon } from '@/app/klantendashboard/components/ui/icons';
import { NegativeFeedbackTable } from '@/app/klantendashboard/gesprekken/components/negative-feedback-table';
import { ReloadButton } from '@/app/klantendashboard/gesprekken/components/reload-button';
import { getOrgChatbot } from '../rag-config';
import { FilterBar } from './filter-bar';

export const dynamic = 'force-dynamic';

const VALID_FILTERS: V1ConversationFilter[] = [
  'today',
  'last_7_days',
  'last_30_days',
  'unanswered',
  'negative_feedback',
];

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function V1GesprekkenPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead
          eyebrow="Gesprekken"
          title="Geen toegang"
          subtitle="Je bent geen lid van deze organisatie."
        />
      );
    }
    throw e; // NEXT_REDIRECT → /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return (
      <PageHead
        eyebrow="Gesprekken"
        title="Alle conversaties op één plek"
        subtitle="Deze organisatie heeft nog geen chatbot geconfigureerd."
      />
    );
  }

  const { filter: rawFilter } = await searchParams;
  const filter: V1ConversationFilter = VALID_FILTERS.includes(rawFilter as V1ConversationFilter)
    ? (rawFilter as V1ConversationFilter)
    : 'last_30_days';

  const [items, negativeFeedback, recentNegativeCount] = await Promise.all([
    filter === 'negative_feedback'
      ? Promise.resolve([])
      : listV1Conversations(supabase, orgId, chatbot.id, filter),
    listV1NegativeFeedback(supabase, orgId, chatbot.id),
    countRecentNegativeFeedback(supabase, orgId, chatbot.id, 7),
  ]);

  const unansweredCount = items.filter((x) => x.unanswered).length;

  return (
    <>
      <PageHead
        eyebrow="Gesprekken"
        title="Alle conversaties op één plek"
        subtitle="Filter op onbeantwoord om snel te zien waar je chatbot vastloopt — en los het direct op door kennis toe te voegen."
        actions={<ReloadButton />}
      />

      <FilterBar active={filter} />

      {filter === 'negative_feedback' ? (
        <NegativeFeedbackTable items={negativeFeedback} />
      ) : items.length === 0 ? (
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
      ) : (
        <>
          {recentNegativeCount > 0 && (
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
              {recentNegativeCount === 1 ? 'bezoeker gaf' : 'bezoekers gaven'} negatieve feedback
              in de laatste 7 dagen.{' '}
              <Link
                href="/v1/app/gesprekken?filter=negative_feedback"
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
                href="/v1/app/gesprekken?filter=unanswered"
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
                <li
                  key={c.id}
                  style={{ borderTop: i ? '1px solid var(--klant-border)' : 'none' }}
                >
                  <Link
                    href={`/v1/app/gesprekken/${c.id}`}
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
                        Bezoeker
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 11,
                          color: 'var(--klant-dim)',
                          fontFamily: 'var(--klant-font-mono)',
                        }}
                      >
                        {formatDateTime(c.lastMessageAt)}
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
                      <StatusBadge
                        status={c.unanswered ? 'unanswered' : 'answered'}
                        kind="conversation"
                      />
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
      )}
    </>
  );
}
