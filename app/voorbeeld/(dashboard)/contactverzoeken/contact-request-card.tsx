'use client';

// Eén contactverzoek als kaart met de werkstroom-acties (status / notitie / wissen).
// De server-actions revalideren /voorbeeld/contactverzoeken; router.refresh() trekt
// de lijst meteen bij. PII (naam/contact/bericht) komt al org-gescoped + onder RLS
// uit de read-laag; hier alleen weergeven + bijwerken.
//
// Rustige vorm: één secundaire hoofdactie (volgende stap in de werkstroom), de
// overige statussen en Verwijderen in het ⋯-menu. Notitie volgt "eerst lezen,
// dan Wijzigen". Bevestigingen en actiefouten via Toast.

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Phone, Trash2 } from 'lucide-react';

import { Button } from '@/app/v1/_ui/button';
import { Badge, type Tone } from '@/app/v1/_ui/feedback';
import { Menu, type MenuItem } from '@/app/v1/_ui/menu';
import { useEditable } from '@/app/v1/_ui/editable';
import { useToast } from '@/app/v1/_ui/toast';
import {
  STATUS_FLOW,
  STATUS_LABEL,
  STATUS_TONE,
  NOTES_MAX,
  type V1ContactRequest,
  type V1ContactRequestStatus,
} from '@/lib/v1/dashboard/contact-requests';
import {
  setContactRequestStatusAction,
  setContactRequestNotesAction,
  deleteContactRequestAction,
} from './actions';

const BADGE_TONE: Record<(typeof STATUS_TONE)[V1ContactRequestStatus], Tone> = {
  warning: 'warn',
  info: 'accent',
  success: 'ok',
};

/** Hoofdactie per status: de volgende stap in de werkstroom. */
const NEXT_STEP: Partial<Record<V1ContactRequestStatus, { status: V1ContactRequestStatus; label: string }>> = {
  new: { status: 'picked_up', label: 'Oppakken' },
  picked_up: { status: 'handled', label: 'Afhandelen' },
};

function formatDateTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    // Vaste zone: server (UTC) en browser renderen dan dezelfde tijd (geen hydration-mismatch).
    timeZone: 'Europe/Amsterdam',
  });
}

export function ContactRequestCard({ request }: { request: V1ContactRequest }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setStatus = (next: V1ContactRequestStatus) =>
    startTransition(async () => {
      const res = await setContactRequestStatusAction(request.id, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Status gewijzigd naar ${STATUS_LABEL[next].toLowerCase()}`);
      router.refresh();
    });

  const doDelete = () =>
    startTransition(async () => {
      const res = await deleteContactRequestAction(request.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConfirmDelete(false);
      toast.success('Contactverzoek verwijderd');
      router.refresh();
    });

  const next = NEXT_STEP[request.status];
  const menuItems: MenuItem[] = [
    ...STATUS_FLOW.filter((s) => s !== request.status && s !== next?.status).map((s) => ({
      label: `Zet op ${STATUS_LABEL[s].toLowerCase()}`,
      onSelect: () => setStatus(s),
      disabled: pending,
    })),
    {
      label: 'Verwijderen',
      icon: <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />,
      onSelect: () => setConfirmDelete(true),
      disabled: pending,
    },
  ];

  const meta = [
    request.preferredContact === 'call' ? 'Liever bellen' : 'Liever mailen',
    formatDateTime(request.createdAt),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="v1-card v1-cv-card" aria-label={`Contactverzoek van ${request.name}`}>
      <div className="v1-cv-head">
        <div className="v1-cv-who">
          <h2 className="v1-cv-name">{request.name}</h2>
          <p className="v1-cv-meta">{meta}</p>
        </div>
        <div className="v1-cv-actions">
          <Badge tone={BADGE_TONE[STATUS_TONE[request.status]]} dot>
            {STATUS_LABEL[request.status]}
          </Badge>
          {next ? (
            <Button variant="secondary" size="sm" loading={pending} onClick={() => setStatus(next.status)}>
              {next.label}
            </Button>
          ) : null}
          <Menu label="Meer acties" items={menuItems} />
        </div>
      </div>

      {request.email || request.phone ? (
        <div className="v1-cv-contact">
          {request.email ? (
            <a href={`mailto:${request.email}`}>
              <Mail size={16} strokeWidth={1.8} aria-hidden="true" />
              {request.email}
            </a>
          ) : null}
          {request.phone ? (
            <a href={`tel:${request.phone}`}>
              <Phone size={16} strokeWidth={1.8} aria-hidden="true" />
              {request.phone}
            </a>
          ) : null}
        </div>
      ) : null}

      {request.subject ? <p className="v1-cv-subject">{request.subject}</p> : null}
      {request.message ? <p className="v1-cv-message">{request.message}</p> : null}

      <NoteBlock request={request} />

      {confirmDelete ? (
        <ConfirmDelete
          name={request.name}
          pending={pending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={doDelete}
        />
      ) : null}
    </article>
  );
}

/** Notitie: eerst lezen, dan Wijzigen. */
function NoteBlock({ request }: { request: V1ContactRequest }) {
  const router = useRouter();
  const toast = useToast();
  const saved = request.notes ?? '';
  const edit = useEditable({
    current: () => ({ notes: saved }),
    save: async ({ notes }) => {
      const res = await setContactRequestNotesAction(request.id, notes);
      if (!res.ok) return { ok: false, error: res.error };
      toast.success('Notitie opgeslagen');
      router.refresh();
      return { ok: true };
    },
  });
  const dirty = edit.draft.notes.trim() !== saved.trim();

  return (
    <section className="v1-cv-note" aria-label="Notitie">
      <div className="v1-cv-note-head">
        <p className="v1-cv-note-label">Notitie</p>
        {edit.editing ? null : (
          <Button ref={edit.triggerRef} variant="ghost" size="sm" onClick={edit.start}>
            {saved ? 'Wijzigen' : 'Toevoegen'}
          </Button>
        )}
      </div>
      {edit.editing ? (
        <form
          className="v1-cv-note-form"
          onSubmit={edit.submit}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !edit.pending) {
              e.stopPropagation();
              edit.cancel();
            }
          }}
        >
          <AutoFocusTextarea
            label="Notitie voor jezelf"
            value={edit.draft.notes}
            onChange={(v) => edit.set('notes', v)}
          />
          {edit.error ? (
            <p className="v1-alert v1-alert--error" role="alert">
              {edit.error}
            </p>
          ) : null}
          <div className="v1-cv-note-bar">
            <Button type="submit" size="sm" loading={edit.pending} disabled={!dirty}>
              Opslaan
            </Button>
            <Button variant="ghost" size="sm" onClick={edit.cancel} disabled={edit.pending}>
              Annuleren
            </Button>
            <span className="v1-cv-note-count">
              {edit.draft.notes.length}/{NOTES_MAX}
            </span>
          </div>
        </form>
      ) : saved ? (
        <p className="v1-cv-note-text">{saved}</p>
      ) : (
        <p className="v1-cv-note-empty">Nog geen notitie.</p>
      )}
    </section>
  );
}

function AutoFocusTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    el?.focus();
  }, [el]);
  return (
    <textarea
      ref={setEl}
      aria-label={label}
      className="v1-input"
      rows={3}
      maxLength={NOTES_MAX}
      value={value}
      placeholder="Bijvoorbeeld wat je hebt afgesproken"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ConfirmDelete({
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  name: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  return (
    <div className="v1-dialog-backdrop" onClick={pending ? undefined : onCancel}>
      <div
        className="v1-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="v1-dialog-title">
          Contactverzoek verwijderen?
        </h2>
        <p className="v1-dialog-body">Het verzoek van {name} verdwijnt uit je lijst.</p>
        <div className="v1-dialog-actions">
          <Button variant="ghost" onClick={onCancel} disabled={pending} autoFocus>
            Annuleren
          </Button>
          <Button onClick={onConfirm} loading={pending}>
            Verwijderen
          </Button>
        </div>
      </div>
    </div>
  );
}
