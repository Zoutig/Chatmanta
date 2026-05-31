// Admin Dashboard — feedback-detail. Volledige context van één admin_feedback-rij
// + bijlage (signed-URL) + status-acties + append-only historie (events).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getAttachmentSignedUrl,
  getFeedback,
  listFeedbackEvents,
} from '@/lib/controlroom/server/feedback';
import {
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_URGENCY_LABELS,
  type FeedbackEvent,
  type FeedbackStatus,
} from '@/lib/controlroom/types';
import { KNOWN_ORGS, resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { formatDateNL, formatRelativeNL } from '@/lib/controlroom/format';
import { buildFeedbackClaudePayload } from '@/lib/controlroom/feedback-claude-payload';
import { CopyButton } from '../../components/copy-button';
import { FeedbackStatusActions } from './components/status-actions';
import { FeedbackPriorityActions } from './components/priority-actions';
import { FeedbackNoteForm } from './components/note-form';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<FeedbackStatus, PillTone> = {
  nieuw: 'warn',
  in_behandeling: 'info',
  opgelost: 'success',
  gesloten: 'neutral',
};

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--klant-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13.5, marginTop: 3, color: 'var(--klant-ink)', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function EVENT_LABEL(ev: FeedbackEvent): string {
  switch (ev.kind) {
    case 'created':
      return 'Melding ingediend';
    case 'status_change':
      return `Status: ${ev.fromStatus ? FEEDBACK_STATUS_LABELS[ev.fromStatus] : '—'} → ${ev.toStatus ? FEEDBACK_STATUS_LABELS[ev.toStatus] : '—'}`;
    case 'comment':
      return 'Reactie';
    case 'internal_note':
      return 'Interne notitie';
    default:
      return ev.kind;
  }
}

const AUTHOR_LABEL: Record<FeedbackEvent['author'], string> = {
  klant: 'Klant',
  operator: 'Operator',
  systeem: 'Systeem',
};

export default async function FeedbackDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getFeedback(id);
  if (!item) notFound();

  const [events, signedUrl] = await Promise.all([
    listFeedbackEvents(item.id),
    item.attachmentPath ? getAttachmentSignedUrl(item.attachmentPath) : Promise.resolve(null),
  ]);

  const slug = resolveOrgSlugFromId(item.organizationId);
  const orgName = slug ? KNOWN_ORGS[slug].name : item.organizationId;
  const ext = item.attachmentName?.split('.').pop()?.toLowerCase() ?? '';
  const isImage = IMAGE_EXT.includes(ext);
  const claudePayload = item.type === 'bug' ? buildFeedbackClaudePayload(item, events, { orgName }) : null;

  return (
    <>
      <PageHead
        eyebrow={`Feedback · ${FEEDBACK_TYPE_LABELS[item.type]}`}
        title={item.description.length > 80 ? `${item.description.slice(0, 80)}…` : item.description}
        actions={
          <>
            <Pill tone={item.urgency === 'high' ? 'danger' : item.urgency === 'normal' ? 'warn' : 'neutral'} dot>
              Urgentie: {FEEDBACK_URGENCY_LABELS[item.urgency]}
            </Pill>
            <Pill tone={STATUS_TONE[item.status]}>{FEEDBACK_STATUS_LABELS[item.status]}</Pill>
          </>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        {claudePayload && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <CopyButton text={claudePayload} label="Kopieer voor Claude Code" />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>Status wijzigen:</span>
          <FeedbackStatusActions id={item.id} status={item.status} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>Prioriteit:</span>
          <FeedbackPriorityActions id={item.id} priority={item.priority} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <Row label="Type" value={FEEDBACK_TYPE_LABELS[item.type]} />
          <Row label="Prioriteit" value={item.priority ? FEEDBACK_PRIORITY_LABELS[item.priority] : '—'} />
          <Row label="Org" value={orgName} />
          <Row label="Ingediend door" value={item.submitterName ?? '—'} />
          <Row label="E-mail" value={item.submitterEmail ?? '—'} />
          <Row label="Ingediend op" value={formatDateNL(item.createdAt)} />
          <Row label="Laatst bijgewerkt" value={formatRelativeNL(item.updatedAt)} />
          <Row label="Chat-ID" value={item.chatId ?? undefined} />
          <Row label="Bron" value={item.source} />
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className="klant-section-title" style={{ marginBottom: 8 }}>Beschrijving</div>
        <p style={{ fontSize: 13.5, margin: 0, color: 'var(--klant-ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {item.description}
        </p>
        {item.question ? (
          <>
            <div className="klant-section-title" style={{ margin: '14px 0 6px' }}>Gestelde vraag</div>
            <p style={{ fontSize: 13, margin: 0, color: 'var(--klant-muted)', wordBreak: 'break-word' }}>{item.question}</p>
          </>
        ) : null}
      </Card>

      {item.attachmentPath ? (
        <Card style={{ marginBottom: 16 }}>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>
            Bijlage{item.attachmentName ? ` · ${item.attachmentName}` : ''}
          </div>
          {signedUrl ? (
            <>
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signedUrl}
                  alt={item.attachmentName ?? 'bijlage'}
                  style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 'var(--klant-r-md)', border: '1px solid var(--klant-border)' }}
                />
              ) : null}
              <div style={{ marginTop: isImage ? 10 : 0 }}>
                <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="klant-btn">
                  Bijlage openen
                </a>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--klant-dim)', margin: 0 }}>
              Bijlage niet beschikbaar (kon geen tijdelijke link genereren).
            </p>
          )}
        </Card>
      ) : null}

      <Card style={{ marginBottom: 16 }}>
        <div className="klant-section-title" style={{ marginBottom: 10 }}>Historie</div>
        {events.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--klant-dim)', margin: 0 }}>Nog geen gebeurtenissen.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map((ev) => (
              <div key={ev.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--klant-accent)', marginTop: 6, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--klant-ink)' }}>{EVENT_LABEL(ev)}</div>
                  {ev.body ? (
                    <div style={{ fontSize: 12.5, color: 'var(--klant-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ev.body}</div>
                  ) : null}
                  <div style={{ fontSize: 11.5, color: 'var(--klant-dim)', marginTop: 2 }}>
                    {AUTHOR_LABEL[ev.author]} · {formatRelativeNL(ev.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className="klant-section-title" style={{ marginBottom: 10 }}>Notitie of reactie toevoegen</div>
        <FeedbackNoteForm id={item.id} />
      </Card>

      <Link href="/admindashboard/feedback" className="klant-btn">← Terug naar Feedback</Link>
    </>
  );
}
