// V0 Klantendashboard — gesprek-detail.
//
// Toont volledige conversatie + gebruikte bronnen (uit het assistant-message
// response.sources jsonb). Read-only — knoppen "Maak Q&A" / "Markeer opgelost"
// loggen alleen een toast in v0 (geen DB-mutaties).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getConversationDetail } from '@/lib/v0/klantendashboard/server/conversations';
import { PageHead } from '../../components/ui/page-head';
import { StatusBadge } from '../../components/status-badge';
import { Icon } from '../../components/ui/icons';
import { CollapsibleSources } from '../../components/ui/collapsible-sources';
import { ConversationActions } from './components/conversation-actions';
import { ConversationId } from './components/conversation-id';

export const dynamic = 'force-dynamic';

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function GesprekDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const activeOrg = await getActiveOrgFromCookies();
  const detail = await getConversationDetail(activeOrg.slug, id);
  if (!detail) notFound();

  // Status afleiden uit laatste assistant message
  const lastAssistant = [...detail.messages].reverse().find((m) => m.role === 'assistant');
  const isUnanswered =
    lastAssistant?.role === 'assistant' && lastAssistant.response.kind === 'fallback';

  // Bronnen verzamelen van alle assistant-messages (alleen kind='answer' heeft ze)
  const allSources = detail.messages.flatMap((m) =>
    m.role === 'assistant' && m.response.kind === 'answer' && Array.isArray(m.response.sources)
      ? m.response.sources
      : [],
  );

  // Eerste user-vraag voor "Maak Q&A"
  const firstUserMsg = detail.messages.find((m) => m.role === 'user');

  return (
    <>
      <Link
        href="/klantendashboard/gesprekken"
        className="klant-btn"
        data-variant="ghost"
        style={{
          textDecoration: 'none',
          marginBottom: 14,
          padding: '6px 10px',
          fontSize: 12,
        }}
      >
        <ArrowLeft size={13} strokeWidth={1.7} /> Terug naar gesprekken
      </Link>

      <PageHead
        eyebrow="Gesprek"
        title="Gesprek bekijken"
        subtitle={`Gestart op ${formatDateTime(detail.thread.createdAt)}`}
        actions={<StatusBadge status={isUnanswered ? 'unanswered' : 'answered'} kind="conversation" />}
      />

      <ConversationId id={id} />

      <section
        className="klant-stack-narrow"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 20,
        }}
      >
        {/* Linkerkolom: conversatie als chat-bubbles */}
        <div
          style={{
            background: 'var(--klant-surface)',
            border: '1px solid var(--klant-border)',
            borderRadius: 'var(--klant-r-lg)',
            boxShadow: 'var(--klant-shadow)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isUnanswered && (
            <div
              style={{
                margin: '16px 18px 0',
                padding: '12px 14px',
                borderRadius: 'var(--klant-r-md)',
                background: 'var(--klant-warn-soft)',
                border: '1px solid var(--klant-warn-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'var(--klant-warn-soft)',
                  color: 'var(--klant-warn)',
                  border: '1px solid var(--klant-warn-border)',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name="alert" size={15} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--klant-ink)' }}>
                  Je chatbot kon deze vraag niet beantwoorden
                </div>
                <div style={{ fontSize: 12, color: 'var(--klant-muted)', marginTop: 2 }}>
                  Voeg een Q&amp;A of pagina toe — vergelijkbare vragen worden meteen meegenomen.
                </div>
              </div>
            </div>
          )}
          <div
            style={{
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {detail.messages.map((m) => {
              const isUser = m.role === 'user';
              const flagged = m.role === 'assistant' && m.response.kind === 'fallback';
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    gap: 4,
                    maxWidth: '82%',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--klant-dim)',
                      fontFamily: 'var(--klant-font-mono)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {isUser ? 'BEZOEKER' : 'CHATMANTA'}
                  </span>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 14,
                      borderTopLeftRadius: isUser ? 14 : 4,
                      borderTopRightRadius: isUser ? 4 : 14,
                      background: isUser ? 'var(--klant-accent-soft)' : 'var(--klant-surface-muted)',
                      border: `1px solid ${
                        flagged
                          ? 'var(--klant-warn-border)'
                          : isUser
                            ? 'var(--klant-accent-border)'
                            : 'var(--klant-border)'
                      }`,
                      color: 'var(--klant-ink)',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rechterkolom: bronnen + acties */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CollapsibleSources sources={allSources} />

          <ConversationActions
            suggestedQuestion={firstUserMsg?.content ?? ''}
            isUnanswered={isUnanswered}
          />
        </aside>
      </section>
    </>
  );
}
