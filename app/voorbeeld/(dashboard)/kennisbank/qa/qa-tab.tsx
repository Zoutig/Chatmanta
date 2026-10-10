'use client';

// V1 Kennisbank Q&A-tab: lijst met eigen vraag-antwoordparen; aan/uit,
// bewerken (zijpaneel met het "huidig bot-antwoord"-venster) en verwijderen.
// Server actions ongewijzigd (./qa-actions, org uit de sessie). De lijst-state
// woont in de Kennisbank-view (voor de teller op de tab).

import { useCallback, useState, useTransition, type Dispatch, type SetStateAction } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge, EmptyState } from '@/app/v1/_ui/feedback';
import { Button } from '@/app/v1/_ui/button';
import { Field, Switch } from '@/app/v1/_ui/controls';
import { Drawer } from '@/app/v1/_ui/drawer';
import { List } from '@/app/v1/_ui/list';
import { useToast } from '@/app/v1/_ui/toast';
import { ConfirmDialog } from '../components/confirm-dialog';
import {
  deleteQAItemAction,
  setQAActiveAction,
  upsertQAItemAction,
} from './qa-actions';
import { CurrentBotAnswer } from './current-bot-answer';

export type QAItem = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  active: boolean;
  ingestedDocumentId: string | null;
};

type DraftQA = { id?: string; question: string; answer: string; category: string; active: boolean };

function emptyDraft(): DraftQA {
  return { question: '', answer: '', category: '', active: true };
}

export function QATab({
  items,
  setItems,
  prefillQuestion,
  newRequest,
}: {
  items: QAItem[];
  setItems: Dispatch<SetStateAction<QAItem[]>>;
  /** Gezet via ?prefillQuestion= (correctieloop): opent meteen een nieuw Q&A met de vraag ingevuld. */
  prefillQuestion?: string;
  /** Telt op als "Q&A schrijven" in het Toevoegen-menu gekozen wordt. */
  newRequest: number;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<DraftQA | null>(
    prefillQuestion ? { ...emptyDraft(), question: prefillQuestion } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const openNew = useCallback(() => {
    setError(null);
    setEditing(emptyDraft());
  }, []);

  // Toevoegen-menu → "Q&A schrijven": open een leeg formulier (state bijwerken tijdens render).
  const [seenNewRequest, setSeenNewRequest] = useState(newRequest);
  if (newRequest !== seenNewRequest) {
    setSeenNewRequest(newRequest);
    setError(null);
    setEditing(emptyDraft());
  }

  const close = useCallback(() => {
    setEditing(null);
    setError(null);
  }, []);
  const cancelDelete = useCallback(() => setConfirmId(null), []);

  function openEdit(qa: QAItem) {
    setError(null);
    setEditing({
      id: qa.id,
      question: qa.question,
      answer: qa.answer,
      category: qa.category ?? '',
      active: qa.active,
    });
  }

  function save() {
    if (!editing) return;
    if (!editing.question.trim() || !editing.answer.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertQAItemAction({
        id: editing.id,
        question: editing.question,
        answer: editing.answer,
        category: editing.category || null,
        active: editing.active,
      });
      if (res.ok) {
        setItems(res.qa);
        setEditing(null);
        toast.success('Q&A opgeslagen');
      } else {
        setError(res.error);
      }
    });
  }

  function toggleActive(id: string) {
    const target = items.find((x) => x.id === id);
    if (!target) return;
    setBusyId(id);
    startTransition(async () => {
      const res = await setQAActiveAction(id, !target.active);
      setBusyId(null);
      if (res.ok) setItems(res.qa);
      else toast.error(res.error);
    });
  }

  function remove() {
    const id = confirmId;
    setConfirmId(null);
    if (!id) return;
    startTransition(async () => {
      const res = await deleteQAItemAction(id);
      if (res.ok) {
        setItems(res.qa);
        toast.success('Q&A verwijderd');
      } else toast.error(res.error);
    });
  }

  const canSave = !!editing && editing.question.trim() !== '' && editing.answer.trim() !== '';

  return (
    <>
      {items.length === 0 ? (
        <div className="v1-card v1-kb-card-flush">
          <EmptyState action={<Button variant="secondary" size="sm" onClick={openNew}>Toevoegen</Button>}>
            Nog geen Q&amp;A. Leg vast wat je chatbot zegt over vaste onderwerpen, zoals openingstijden.
          </EmptyState>
        </div>
      ) : (
        <div className="v1-card v1-kb-card-flush">
          <List label="Q&A">
            {items.map((qa) => (
              <li key={qa.id} className="v1-kb-qa-row" data-inactive={!qa.active}>
                <div className="v1-list-row">
                  <span className="v1-list-main">
                    {qa.category || !qa.active ? (
                      <span className="v1-kb-qa-tags">
                        {qa.category ? <span className="v1-chip">{qa.category}</span> : null}
                        {!qa.active ? <Badge>Inactief</Badge> : null}
                      </span>
                    ) : null}
                    <span className="v1-list-title v1-list-title--wrap">{qa.question}</span>
                    <span className="v1-kb-qa-answer">{qa.answer}</span>
                  </span>
                  <span className="v1-list-end">
                    <button
                      type="button"
                      role="switch"
                      className="v1-switch"
                      aria-checked={qa.active}
                      aria-label={`Actief: ${qa.question}`}
                      title={qa.active ? 'Inactief maken' : 'Activeren'}
                      disabled={pending && busyId === qa.id}
                      onClick={() => toggleActive(qa.id)}
                    />
                    <button type="button" className="v1-menu-btn" onClick={() => openEdit(qa)}
                      aria-label={`Bewerken: ${qa.question}`} title="Bewerken">
                      <Pencil size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    <button type="button" className="v1-menu-btn v1-kb-iconbtn--danger" onClick={() => setConfirmId(qa.id)}
                      aria-label={`Verwijderen: ${qa.question}`} title="Verwijderen">
                      <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </List>
        </div>
      )}

      {editing && (
        <Drawer
          title={editing.id ? 'Q&A bewerken' : 'Nieuwe Q&A'}
          onClose={close}
          footer={
            <>
              <Button variant="ghost" onClick={close} disabled={pending}>
                Annuleren
              </Button>
              <Button onClick={save} loading={pending} disabled={!canSave}>
                Opslaan
              </Button>
            </>
          }
        >
          <form
            className="v1-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="Vraag">
              {(id) => (
                <input
                  id={id}
                  className="v1-input"
                  value={editing.question}
                  onChange={(e) => setEditing({ ...editing, question: e.target.value })}
                  placeholder="Bijv. Wat zijn jullie openingstijden?"
                  autoFocus
                />
              )}
            </Field>
            <Field label="Antwoord dat je chatbot moet geven" hint="Bekijk wat je chatbot nu zegt en pas het aan.">
              {(id) => (
                <>
                  <CurrentBotAnswer question={editing.question} />
                  <textarea
                    id={id}
                    className="v1-input"
                    value={editing.answer}
                    onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
                    placeholder="Het antwoord dat je chatbot voortaan geeft"
                    rows={5}
                  />
                </>
              )}
            </Field>
            <Field label="Categorie (optioneel)">
              {(id) => (
                <input
                  id={id}
                  className="v1-input"
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  placeholder="Bijv. Openingstijden, Prijzen, Contact"
                />
              )}
            </Field>
            <Switch
              label="Actief"
              description="Je chatbot gebruikt dit antwoord."
              checked={editing.active}
              onChange={(active) => setEditing({ ...editing, active })}
            />
            {error && (
              <p className="v1-alert v1-alert--error" role="alert">
                {error}
              </p>
            )}
          </form>
        </Drawer>
      )}

      {confirmId ? (
        <ConfirmDialog
          title="Q&A verwijderen?"
          body="Je chatbot gebruikt dit antwoord daarna niet meer."
          confirmLabel="Verwijderen"
          onCancel={cancelDelete}
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}
