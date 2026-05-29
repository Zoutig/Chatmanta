// Admin Dashboard — gesprek-detail per klant (taak 4). Volledige transcript van
// één gesprek, ORG-GEFILTERD via de route-param (niet de active-org cookie):
// getConversationDetail → getThread(threadId, KNOWN_ORGS[slug].id), dus een
// thread van een andere org levert null → notFound. Read-only weergave; de
// Q&A-/markeer-acties uit het klantendashboard zijn cookie-gebonden en horen
// daar, niet hier.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { getConversationDetail } from '@/lib/v0/klantendashboard/server/conversations';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { StatusBadge } from '@/app/klantendashboard/components/status-badge';
import { ReloadButton } from '@/app/admindashboard/components/reload-button';

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

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--klant-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 3, color: 'var(--klant-ink)', wordBreak: 'break-word' }}>{children}</div>
    </div>
  );
}

export default async function AdminGesprekDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; threadId: string }>;
}) {
  const { orgSlug, threadId } = await params;
  if (!(orgSlug in KNOWN_ORGS)) notFound();
  const slug = orgSlug as OrgSlug;

  const detail = await getConversationDetail(slug, threadId);
  if (!detail) notFound();

  // Status uit het laatste assistant-antwoord; een 'fallback' is het enige
  // "systeem"-signaal dat het datamodel kent (er zijn geen system-rollen).
  const lastAssistant = [...detail.messages].reverse().find((m) => m.role === 'assistant');
  const isUnanswered = lastAssistant?.role === 'assistant' && lastAssistant.response.kind === 'fallback';

  // Bronnen uit alle beantwoorde assistant-messages.
  const allSources = detail.messages.flatMap((m) =>
    m.role === 'assistant' && m.response.kind === 'answer' && Array.isArray(m.response.sources)
      ? m.response.sources
      : [],
  );

  return (
    <>
      <Link
        href={`/admindashboard/klanten/${slug}?tab=gesprekken`}
        className="klant-btn"
        data-variant="ghost"
        style={{ textDecoration: 'none', marginBottom: 14, padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={13} strokeWidth={1.7} /> Terug naar gesprekken
      </Link>

      <PageHead
        eyebrow={`Admin Dashboard · ${KNOWN_ORGS[slug].name}`}
        title="Gesprek"
        subtitle={`Gestart op ${formatDateTime(detail.thread.createdAt)}`}
        actions={
          <>
            <StatusBadge kind="conversation" status={isUnanswered ? 'unanswered' : 'answered'} />
            <ReloadButton />
          </>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <InfoItem label="Klant">{KNOWN_ORGS[slug].name}</InfoItem>
          <InfoItem label="Conversation ID"><code style={{ fontSize: 12, fontFamily: 'var(--klant-font-mono)' }}>{detail.thread.id}</code></InfoItem>
          <InfoItem label="Bot-versie">{detail.thread.botVersion || '—'}</InfoItem>
          <InfoItem label="Berichten">{detail.messages.length}</InfoItem>
          <InfoItem label="Gestart">{formatDateTime(detail.thread.createdAt)}</InfoItem>
          <InfoItem label="Laatste activiteit">{formatDateTime(detail.thread.updatedAt)}</InfoItem>
          <InfoItem label="Status">{isUnanswered ? 'Onbeantwoord (fallback)' : 'Beantwoord'}</InfoItem>
        </div>
      </Card>

      <section className="klant-stack-narrow" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20 }}>
        {/* Transcript */}
        <Card padded={false}>
          {detail.messages.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--klant-dim)', padding: 18, margin: 0 }}>
              Dit gesprek bevat nog geen berichten.
            </p>
          ) : (
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '72vh', overflowY: 'auto' }}>
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
                    <span style={{ fontSize: 11, color: 'var(--klant-dim)', fontFamily: 'var(--klant-font-mono)', letterSpacing: '0.04em' }}>
                      {isUser ? 'BEZOEKER' : flagged ? 'CHATMANTA · FALLBACK' : 'CHATMANTA'}
                    </span>
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 14,
                        borderTopLeftRadius: isUser ? 14 : 4,
                        borderTopRightRadius: isUser ? 4 : 14,
                        background: isUser ? 'var(--klant-accent-soft)' : 'var(--klant-surface-muted)',
                        border: `1px solid ${flagged ? 'var(--klant-warn-border)' : isUser ? 'var(--klant-accent-border)' : 'var(--klant-border)'}`,
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
          )}
        </Card>

        {/* Gebruikte bronnen */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <h3 className="klant-section-title" style={{ marginBottom: 10 }}>
              <BookOpen size={15} strokeWidth={1.7} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
              Gebruikte bronnen
            </h3>
            {allSources.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--klant-fg-muted)', margin: 0 }}>
                Geen bronnen — dit gesprek had geen relevante kennisbank-treffer.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allSources.slice(0, 10).map((s, i) => {
                  const excerpt = s.parentExcerpt ?? s.contentExcerpt ?? '';
                  return (
                    <li key={i} style={{ padding: '8px 10px', background: 'var(--klant-surface-muted)', borderRadius: 'var(--klant-r-sm)', fontSize: 12 }}>
                      <div style={{ color: 'var(--klant-fg)', fontWeight: 500 }}>{s.filename || 'Onbekend'}</div>
                      {excerpt && (
                        <div style={{ color: 'var(--klant-fg-muted)', marginTop: 2, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {excerpt}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </aside>
      </section>
    </>
  );
}
