// V1 Klantendashboard — Gesprekken (lijst + negatieve feedback).
//
// Read-only. Auth-keten = die van /v1/app: getSessionOrg → AUTH_FORBIDDEN →
// "Geen toegang"; geen sessie → NEXT_REDIRECT propageert naar /v1/login. Alle
// reads onder de session-client (RLS), org+chatbot uit de sessie.

import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import {
  listV1Conversations,
  listV1NegativeFeedback,
  type V1ConversationFilter,
} from '@/lib/v1/dashboard/conversations';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { TabsNav } from '@/app/klantendashboard/components/tabs';
import { StatusBadge } from '@/app/klantendashboard/components/status-badge';
import { NegativeFeedbackTable } from '@/app/klantendashboard/gesprekken/components/negative-feedback-table';
import { getOrgChatbot } from '../rag-config';
import { FilterBar } from './filter-bar';

export const dynamic = 'force-dynamic';

const VALID_FILTERS: V1ConversationFilter[] = ['today', 'last_7_days', 'last_30_days', 'unanswered'];

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
  searchParams: Promise<{ tab?: string; filter?: string }>;
}) {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHead eyebrow="Gesprekken" title="Geen toegang" subtitle="Je bent geen lid van deze organisatie." />;
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

  const { tab: rawTab, filter: rawFilter } = await searchParams;
  const tab: 'alle' | 'negative' = rawTab === 'negative' ? 'negative' : 'alle';
  const filter: V1ConversationFilter = VALID_FILTERS.includes(rawFilter as V1ConversationFilter)
    ? (rawFilter as V1ConversationFilter)
    : 'last_30_days';

  return (
    <>
      <PageHead
        eyebrow="Gesprekken"
        title="Alle conversaties op één plek"
        subtitle="Filter op onbeantwoord om snel te zien waar je chatbot vastloopt — en los het op door kennis toe te voegen."
      />

      <TabsNav
        basePath="/v1/app/gesprekken"
        paramName="tab"
        active={tab}
        tabs={[
          { key: 'alle', label: 'Alle gesprekken' },
          { key: 'negative', label: 'Negatieve feedback' },
        ]}
      />

      {tab === 'negative' ? (
        <NegativeFeedbackTable items={await listV1NegativeFeedback(supabase, orgId, chatbot.id)} />
      ) : (
        <>
          <FilterBar active={filter} />
          <ConversationList items={await listV1Conversations(supabase, orgId, chatbot.id, filter)} filter={filter} />
        </>
      )}
    </>
  );
}

function ConversationList({
  items,
  filter,
}: {
  items: Awaited<ReturnType<typeof listV1Conversations>>;
  filter: V1ConversationFilter;
}) {
  if (items.length === 0) {
    return (
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
    );
  }

  return (
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
              href={`/v1/app/gesprekken/${c.id}`}
              className="klant-convo-row"
              style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '13px 18px', textDecoration: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--klant-ink)', fontWeight: 500 }}>Bezoeker</span>
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
                <StatusBadge status={c.unanswered ? 'unanswered' : 'answered'} kind="conversation" />
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
  );
}
