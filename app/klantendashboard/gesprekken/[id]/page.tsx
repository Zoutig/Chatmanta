// V0 Klantendashboard — gesprek-detail.
//
// Toont volledige conversatie + gebruikte bronnen (uit het assistant-message
// response.sources jsonb). Read-only — knoppen "Maak Q&A" / "Markeer opgelost"
// loggen alleen een toast in v0 (geen DB-mutaties).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getConversationDetail } from '@/lib/v0/klantendashboard/server/conversations';
import { PageHeader } from '../../components/page-header';
import { StatusBadge } from '../../components/status-badge';
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

      <PageHeader
        title="Gesprek bekijken"
        subtitle={`Gestart op ${formatDateTime(detail.thread.createdAt)}`}
        action={<StatusBadge status={isUnanswered ? 'unanswered' : 'answered'} kind="conversation" />}
      />

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 20,
        }}
      >
        {/* Linkerkolom: conversatie */}
        <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 className="klant-section-title">Conversatie</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {detail.messages.map((m) => (
              <article
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '10px 12px',
                  borderRadius: 'var(--klant-r-md)',
                  background:
                    m.role === 'user' ? 'var(--klant-surface)' : 'var(--klant-accent-soft)',
                  border:
                    '1px solid ' +
                    (m.role === 'user' ? 'var(--klant-border)' : 'var(--klant-border-strong)'),
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '92%',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: m.role === 'user' ? 'var(--klant-fg-muted)' : 'var(--klant-accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {m.role === 'user' ? 'Bezoeker' : 'Chatbot'}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: 'var(--klant-fg)',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Rechterkolom: bronnen + acties */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 className="klant-section-title">
              <BookOpen
                size={15}
                strokeWidth={1.7}
                style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }}
              />
              Gebruikte bronnen
            </h3>
            {allSources.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--klant-fg-muted)',
                  margin: 0,
                }}
              >
                Geen bronnen gevonden. Dit gesprek had geen relevant antwoord in je kennisbank.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allSources.slice(0, 10).map((s, i) => {
                  const excerpt = s.parentExcerpt ?? s.contentExcerpt ?? '';
                  return (
                    <li
                      key={i}
                      style={{
                        padding: '8px 10px',
                        background: 'var(--klant-surface)',
                        borderRadius: 'var(--klant-r-sm)',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ color: 'var(--klant-fg)', fontWeight: 500 }}>
                        {s.filename || 'Onbekend'}
                      </div>
                      {excerpt && (
                        <div
                          style={{
                            color: 'var(--klant-fg-muted)',
                            marginTop: 2,
                            lineHeight: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {excerpt}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <ConversationActions
            suggestedQuestion={firstUserMsg?.content ?? ''}
            isUnanswered={isUnanswered}
          />
        </aside>
      </section>
    </>
  );
}
