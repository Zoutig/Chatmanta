// V1 admin — feedback-detail (V1-ontwerplaag; port van de V0-admin-feedbackdetail).
// Auth: admin layout (requireJorionAdmin). DB via service-role helpers.
// Org-naam komt via getTicket-join (geen KNOWN_ORGS in V1).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireJorionAdmin } from '@/lib/auth';
import { getTicket, listTicketEvents, getTicketAttachmentSignedUrl } from '@/lib/v1/feedback/db';
import {
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_URGENCY_LABELS,
  type FeedbackEvent,
  type FeedbackStatus,
} from '@/lib/controlroom/types';
import { formatRelativeNL } from '@/lib/controlroom/format';
import { buildFeedbackClaudePayload } from '@/lib/controlroom/feedback-claude-payload';
import { isValidFeedbackEmail } from '@/lib/notifications/feedback-email';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Panel, Rows, Row, EmptyValue } from '@/app/v1/_ui/panel';
import { Badge, EmptyState, type Tone } from '@/app/v1/_ui/feedback';
import { buttonClass } from '@/app/v1/_ui/button';
import { CopyButton } from '@/app/v1/admin/_ui/copy-button';
import { formatDate } from '@/app/v1/admin/_ui/format';
import { FeedbackStatusActionsV1 } from './components/status-actions';
import { FeedbackPriorityActionsV1 } from './components/priority-actions';
import { FeedbackNoteFormV1 } from './components/note-form';
import { FeedbackReplyFormV1 } from './components/reply-form';
import './detail.css';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<FeedbackStatus, Tone> = {
  nieuw: 'warn',
  in_behandeling: 'accent',
  opgelost: 'ok',
  gesloten: 'neutral',
};

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/** Lees-rij die (zoals voorheen) wegvalt als er geen waarde is. */
function OptionalRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null;
  return <Row label={label}>{value}</Row>;
}

function eventLabel(ev: FeedbackEvent): string {
  switch (ev.kind) {
    case 'created': return 'Melding ingediend';
    case 'status_change':
      return `Status gewijzigd van ${ev.fromStatus ? FEEDBACK_STATUS_LABELS[ev.fromStatus] : 'Onbekend'} naar ${ev.toStatus ? FEEDBACK_STATUS_LABELS[ev.toStatus] : 'Onbekend'}`;
    case 'comment': return 'Reactie';
    case 'internal_note': return 'Interne notitie';
    default: return ev.kind;
  }
}

const AUTHOR_LABEL: Record<FeedbackEvent['author'], string> = {
  klant: 'Klant',
  operator: 'Operator',
  systeem: 'Systeem',
};

export default async function V1FeedbackDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireJorionAdmin(); // defense-in-depth: page-level gate náást de layout (leest cross-org PII + mint signed-URL)
  const { id } = await params;
  const item = await getTicket(id);
  if (!item) notFound();

  const [events, signedUrl] = await Promise.all([
    listTicketEvents(item.id),
    item.attachmentPath ? getTicketAttachmentSignedUrl(item.attachmentPath) : Promise.resolve(null),
  ]);

  const ext = item.attachmentName?.split('.').pop()?.toLowerCase() ?? '';
  const isImage = IMAGE_EXT.includes(ext);
  const claudePayload = item.type === 'bug' ? buildFeedbackClaudePayload(item, events, { orgName: item.orgName }) : null;

  return (
    <div className="v1-page">
      <Link href="/v1/admin/feedback" className="v1-section-link">Terug naar Feedback</Link>

      <PageHeader
        title={item.description.length > 80 ? `${item.description.slice(0, 80)}…` : item.description}
        description={`Feedback · ${FEEDBACK_TYPE_LABELS[item.type]}`}
        actions={
          <>
            <Badge tone={item.urgency === 'high' ? 'danger' : item.urgency === 'normal' ? 'warn' : 'neutral'} dot>
              Urgentie: {FEEDBACK_URGENCY_LABELS[item.urgency]}
            </Badge>
            <Badge tone={STATUS_TONE[item.status]}>{FEEDBACK_STATUS_LABELS[item.status]}</Badge>
          </>
        }
      />

      <Panel
        id="fb-afhandeling"
        title="Afhandeling"
        meta={claudePayload ? <CopyButton text={claudePayload} label="Kopieer voor Claude Code" /> : undefined}
      >
        <Rows>
          <Row label="Status wijzigen">
            <FeedbackStatusActionsV1 id={item.id} status={item.status} />
          </Row>
          <Row label="Prioriteit">
            <FeedbackPriorityActionsV1 id={item.id} priority={item.priority} />
          </Row>
        </Rows>
      </Panel>

      <Panel id="fb-gegevens" title="Gegevens">
        <Rows>
          <Row label="Type">{FEEDBACK_TYPE_LABELS[item.type]}</Row>
          <Row label="Prioriteit">
            {item.priority ? FEEDBACK_PRIORITY_LABELS[item.priority] : <EmptyValue>Geen</EmptyValue>}
          </Row>
          <OptionalRow label="Organisatie" value={item.orgName} />
          <Row label="Ingediend door">{item.submitterName ?? <EmptyValue>Onbekend</EmptyValue>}</Row>
          <Row label="E-mail">{item.submitterEmail ?? <EmptyValue>Geen</EmptyValue>}</Row>
          <Row label="Ingediend op">{formatDate(item.createdAt)}</Row>
          <Row label="Laatst bijgewerkt">{formatRelativeNL(item.updatedAt)}</Row>
          <OptionalRow label="Chat-ID" value={item.chatId ?? undefined} />
          <OptionalRow label="Bron" value={item.source} />
        </Rows>
      </Panel>

      <section className="v1-card">
        <h2 className="v1-section-title v1-adm-fbd-head">Beschrijving</h2>
        <p className="v1-adm-fbd-text">{item.description}</p>
        {item.question ? (
          <>
            <h3 className="v1-adm-fbd-sub">Gestelde vraag</h3>
            <p className="v1-adm-fbd-question">{item.question}</p>
          </>
        ) : null}
      </section>

      {item.attachmentPath ? (
        <section className="v1-card">
          <h2 className="v1-section-title v1-adm-fbd-head">
            Bijlage{item.attachmentName ? ` · ${item.attachmentName}` : ''}
          </h2>
          {signedUrl ? (
            <>
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signedUrl} alt={item.attachmentName ?? 'bijlage'} className="v1-adm-fbd-img" />
              ) : null}
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                Bijlage openen
              </a>
            </>
          ) : (
            <p className="v1-adm-muted">Bijlage niet beschikbaar (kon geen tijdelijke link genereren).</p>
          )}
        </section>
      ) : null}

      <section className="v1-card">
        <h2 className="v1-section-title v1-adm-fbd-head">Historie</h2>
        {events.length === 0 ? (
          <EmptyState>Nog geen gebeurtenissen.</EmptyState>
        ) : (
          <ol className="v1-adm-fbd-timeline">
            {events.map((ev) => (
              <li key={ev.id} className="v1-adm-fbd-event">
                <span className="v1-adm-fbd-dot" aria-hidden="true" />
                <div className="v1-adm-fbd-event-main">
                  <div className="v1-adm-fbd-event-title">{eventLabel(ev)}</div>
                  {ev.body ? <div className="v1-adm-fbd-event-body">{ev.body}</div> : null}
                  <div className="v1-adm-fbd-event-meta">
                    {AUTHOR_LABEL[ev.author]} · {formatRelativeNL(ev.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="v1-card">
        <h2 className="v1-section-title v1-adm-fbd-head">Reageren naar de klant</h2>
        <FeedbackReplyFormV1
          id={item.id}
          submitterEmail={item.submitterEmail}
          disabledReason={
            !isValidFeedbackEmail(item.submitterEmail)
              ? 'Deze melding heeft geen e-mailadres, dus je kunt er niet per mail op reageren.'
              : !item.privacyAcceptedAt
                ? 'De indiener heeft geen toestemming gegeven om gecontacteerd te worden.'
                : null
          }
        />
      </section>

      <section className="v1-card">
        <h2 className="v1-section-title v1-adm-fbd-head">Interne notitie of reactie toevoegen</h2>
        <FeedbackNoteFormV1 id={item.id} />
      </section>
    </div>
  );
}
