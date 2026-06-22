'use client';

// Eén contactverzoek-kaart met de werkstroom-acties (status / notitie / wissen).
// Client-component: de server-actions revalideren /klantendashboard; router.refresh()
// trekt de tab + sidebar-badge meteen bij. PII (naam/contact/toelichting) komt al
// org-gescoped uit de read-module — hier alleen weergeven + bijwerken.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Phone, Trash2, ExternalLink } from 'lucide-react';

import { StatusBadge } from '../../components/status-badge';
import type { ContactRequest, ContactRequestStatus } from '@/lib/v0/klantendashboard/types';
import {
  setContactRequestStatusAction,
  setContactRequestNotesAction,
  deleteContactRequestAction,
} from '../actions';

const NOTES_MAX = 4000;

const STATUS_FLOW: ContactRequestStatus[] = ['nieuw', 'opgepakt', 'afgehandeld'];
const STATUS_LABEL: Record<ContactRequestStatus, string> = {
  nieuw: 'Nieuw',
  opgepakt: 'Opgepakt',
  afgehandeld: 'Afgehandeld',
};

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ContactRequestCard({ request }: { request: ContactRequest }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(request.notes ?? '');
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notesDirty = notes.trim() !== (request.notes ?? '').trim();

  const setStatus = (next: ContactRequestStatus) =>
    startTransition(async () => {
      setError(null);
      const res = await setContactRequestStatusAction(request.id, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  const saveNotes = () =>
    startTransition(async () => {
      setError(null);
      setNotesSaved(false);
      const res = await setContactRequestNotesAction(request.id, notes);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
      router.refresh();
    });

  const doDelete = () =>
    startTransition(async () => {
      setError(null);
      const res = await deleteContactRequestAction(request.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  return (
    <div className="contactverzoek-card">
      <div className="contactverzoek-card-head">
        <div style={{ minWidth: 0 }}>
          <div className="contactverzoek-name">{request.name}</div>
          <div className="contactverzoek-meta">
            <span className="contactverzoek-pref">
              {request.preferredContact === 'call' ? (
                <>
                  <Phone size={12} strokeWidth={1.8} /> Liever bellen
                </>
              ) : (
                <>
                  <Mail size={12} strokeWidth={1.8} /> Liever mailen
                </>
              )}
            </span>
            <span className="contactverzoek-date">{formatDateTime(request.createdAt)}</span>
          </div>
        </div>
        <StatusBadge status={request.status} kind="contactRequest" />
      </div>

      <div className="contactverzoek-contact">
        {request.email && (
          <a href={`mailto:${request.email}`} className="contactverzoek-contact-link">
            <Mail size={13} strokeWidth={1.8} /> {request.email}
          </a>
        )}
        {request.phone && (
          <a href={`tel:${request.phone}`} className="contactverzoek-contact-link">
            <Phone size={13} strokeWidth={1.8} /> {request.phone}
          </a>
        )}
      </div>

      {request.subject && <div className="contactverzoek-subject">{request.subject}</div>}
      {request.toelichting && <p className="contactverzoek-toelichting">{request.toelichting}</p>}

      {/* Null-safe: alléén een werkende link tonen als er een bron-gesprek is. */}
      {request.threadId && (
        <Link href={`/klantendashboard/gesprekken/${request.threadId}`} className="contactverzoek-thread-link">
          <ExternalLink size={12} strokeWidth={1.8} /> Bekijk het gesprek
        </Link>
      )}

      <div className="contactverzoek-actions">
        <span className="contactverzoek-actions-label">Status:</span>
        {STATUS_FLOW.filter((s) => s !== request.status).map((s) => (
          <button
            key={s}
            type="button"
            className="klant-btn"
            data-variant={s === 'afgehandeld' ? 'primary' : undefined}
            disabled={pending}
            onClick={() => setStatus(s)}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="contactverzoek-notes">
        <label className="klant-label" htmlFor={`cr-notes-${request.id}`}>
          Notitie
        </label>
        <textarea
          id={`cr-notes-${request.id}`}
          className="klant-textarea"
          rows={2}
          maxLength={NOTES_MAX}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesSaved(false);
          }}
          placeholder="Interne notitie over de opvolging…"
          style={{ resize: 'vertical' }}
        />
        <div className="contactverzoek-notes-bar">
          <button
            type="button"
            className="klant-btn"
            disabled={pending || !notesDirty}
            onClick={saveNotes}
          >
            {pending ? 'Bezig…' : 'Notitie opslaan'}
          </button>
          {notesSaved && <span className="contactverzoek-saved">Opgeslagen</span>}
          <span className="contactverzoek-notes-count">
            {notes.length}/{NOTES_MAX}
          </span>
          <span style={{ marginLeft: 'auto' }}>
            {confirmDelete ? (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <span className="contactverzoek-confirm">Verwijderen?</span>
                <button
                  type="button"
                  className="klant-btn"
                  data-variant="danger"
                  disabled={pending}
                  onClick={doDelete}
                >
                  Ja, wissen
                </button>
                <button
                  type="button"
                  className="klant-btn"
                  disabled={pending}
                  onClick={() => setConfirmDelete(false)}
                >
                  Annuleren
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="klant-btn contactverzoek-delete"
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={13} strokeWidth={1.8} /> Verwijderen
              </button>
            )}
          </span>
        </div>
      </div>

      {error && (
        <div className="contactverzoek-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
