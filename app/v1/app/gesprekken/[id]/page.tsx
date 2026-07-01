// V1 Klantendashboard — gesprek-detail. Faithful port van V0's detail-layout:
// twee kolommen (transcript links, acties rechts), unanswered-banner, ConversationId
// in de footer. Bronnen-paneel WEGGELATEN — V1 thread_messages dragen geen sources-jsonb.
//
// Auth: getSessionOrg → AUTH_FORBIDDEN / NEXT_REDIRECT. Read via session-client (RLS):
// een thread van een andere org geeft null terug → notFound(). Geen service-role nodig.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getV1Conversation } from '@/lib/v1/dashboard/conversations';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { StatusBadge } from '@/app/klantendashboard/components/status-badge';
import { Icon } from '@/app/klantendashboard/components/ui/icons';
import { ConversationId } from '@/app/klantendashboard/gesprekken/[id]/components/conversation-id';
import { ConversationActions } from './components/conversation-actions';

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

export default async function V1GesprekDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead
          eyebrow="Gesprek"
          title="Geen toegang"
          subtitle="Je bent geen lid van deze organisatie."
        />
      );
    }
    throw e; // NEXT_REDIRECT → /v1/login
  }

  const supabase = await createClient();
  const detail = await getV1Conversation(supabase, orgId, id);
  if (!detail) notFound();

  // Status afleiden uit het laatste assistant-bericht.
  const lastAssistant = [...detail.messages].reverse().find((m) => m.role === 'assistant');
  const isUnanswered = lastAssistant?.kind === 'fallback';

  // Eerste user-vraag + laatste bot-antwoord voor "Maak Q&A".
  const firstUserMsg = detail.messages.find((m) => m.role === 'user');
  const suggestedAnswer =
    !isUnanswered && lastAssistant ? lastAssistant.content : '';

  return (
    <>
      <Link
        href="/v1/app/gesprekken"
        className="klant-btn"
        data-variant="ghost"
        style={{ textDecoration: 'none', marginBottom: 14, padding: '6px 10px', fontSize: 12 }}
      >
        <ArrowLeft size={13} strokeWidth={1.7} /> Terug naar gesprekken
      </Link>

      <PageHead
        eyebrow="Gesprek"
        title="Gesprek bekijken"
        subtitle={`Gestart op ${formatDateTime(detail.thread.createdAt)}`}
        actions={
          <StatusBadge status={isUnanswered ? 'unanswered' : 'answered'} kind="conversation" />
        }
      />

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
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {detail.messages.map((m) => {
              const isUser = m.role === 'user';
              const flagged = m.kind === 'fallback';
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
                      background: isUser
                        ? 'var(--klant-accent-soft)'
                        : 'var(--klant-surface-muted)',
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

        {/* Rechterkolom: acties (bronnen-paneel weggelaten — V1 heeft geen sources-jsonb) */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ConversationActions
            threadId={id}
            suggestedQuestion={firstUserMsg?.content ?? ''}
            suggestedAnswer={suggestedAnswer}
            isUnanswered={isUnanswered}
          />
        </aside>
      </section>

      <ConversationId id={id} />
    </>
  );
}
