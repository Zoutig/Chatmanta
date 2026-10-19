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
  retryQAIngestAction,
  setQAActiveAction,
  upsertQAItemAction,
} from './qa-actions';
import { deleteDocumentAction } from '../actions';
import { CurrentBotAnswer } from './current-bot-answer';
import { QASavedNotice } from './qa-saved-notice';

export type QAItem = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  active: boolean;
  ingestedDocumentId: string | null;
};

/** Een quiz-antwoord dat als document in de kennisbank staat (eigen lijst hier,
 *  niet meer als losse rij in Documenten). */
export type QuizKnowledgeItem = {
  documentId: string;
  question: string;
  answer: string;
  label: string;
};

type DraftQA = { id?: string; question: string; answer: string; category: string; active: boolean };

function emptyDraft(): DraftQA {
  return { question: '', answer: '', category: '', active: true };
}

export function QATab({
  items,
  setItems,
  quizItems = [],
  setQuizItems,
  prefillQuestion,
  newRequest,
}: {
  items: QAItem[];
  setItems: Dispatch<SetStateAction<QAItem[]>>;
  quizItems?: QuizKnowledgeItem[];
  setQuizItems?: Dispatch<SetStateAction<QuizKnowledgeItem[]>>;
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
  const [confirmQuizDoc, setConfirmQuizDoc] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ question: string; notIngested: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const closeSaved = useCallback(() => setSaved(null), []);
  const cancelQuizDelete = useCallback(() => setConfirmQuizDoc(null), []);

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
        const question = editing.question.trim();
        setEditing(null);
        // Een inactief item hoeft de bot niet te kennen: dan alleen een korte toast.
        if (editing.active) setSaved({ question, notIngested: res.notIngested });
        else toast.success('Q&A opgeslagen (inactief)');
      } else {
        setError(res.error);
      }
    });
  }

  function retryIngest(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await retryQAIngestAction(id);
      setBusyId(null);
      if (res.ok) {
        setItems(res.qa);
        const now = res.qa.find((x) => x.id === id);
        if (now?.ingestedDocumentId) toast.success('Je chatbot kent dit antwoord nu');
      } else toast.error(res.error);
    });
  }

  function removeQuizDoc() {
    const docId = confirmQuizDoc;
    setConfirmQuizDoc(null);
    if (!docId) return;
    startTransition(async () => {
      const res = await deleteDocumentAction(docId);
      if (res.ok) {
        setQuizItems?.((list) => list.filter((x) => x.documentId !== docId));
        toast.success('Quiz-antwoord verwijderd');
      } else toast.error(res.error);
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
      {saved ? <QASavedNotice question={saved.question} notIngested={saved.notIngested} onClose={closeSaved} /> : null}

      {items.length === 0 ? (
        <div className="v1-card v1-kb-card-flush">
          <EmptyState action={<Button variant="secondary" size="sm" onClick={openNew}>Toevoegen</Button>}>
            Nog geen Q&amp;A. Leg vast wat je chatbot zegt over vaste onderwerpen, zoals openingstijden.
          </EmptyState>
        </div>
      ) : (
        <div className="v1-card v1-kb-card-flush">
          <List label="Q&A">
            {items.map((qa) => {
              const notLearned = qa.active && !qa.ingestedDocumentId;
              return (
              <li key={qa.id} className="v1-kb-qa-row" data-inactive={!qa.active}>
                <div className="v1-list-row">
                  <span className="v1-list-main">
                    {qa.category || !qa.active || notLearned ? (
                      <span className="v1-kb-qa-tags">
                        {qa.category ? <span className="v1-chip">{qa.category}</span> : null}
                        {!qa.active ? <Badge>Inactief</Badge> : null}
                        {notLearned ? <Badge tone="warn">Nog niet in je chatbot</Badge> : null}
                      </span>
                    ) : null}
                    <span className="v1-list-title v1-list-title--wrap">{qa.question}</span>
                    <span className="v1-kb-qa-answer">{qa.answer}</span>
                  </span>
                  <span className="v1-list-end">
                    {notLearned ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={pending && busyId === qa.id}
                        onClick={() => retryIngest(qa.id)}
                      >
                        Opnieuw proberen
                      </Button>
                    ) : null}
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
              );
            })}
          </List>
        </div>
      )}

      {quizItems.length > 0 ? (
        <section className="v1-card v1-kb-card-flush" aria-label="Uit de kennisquiz">
          <p className="v1-kb-quiz-head">
            Uit de kennisquiz <span className="v1-hint">· je antwoorden, die je chatbot ook gebruikt</span>
          </p>
          <List label="Quiz-antwoorden">
            {quizItems.map((qz) => (
              <li key={qz.documentId} className="v1-kb-qa-row">
                <div className="v1-list-row">
                  <span className="v1-list-main">
                    <span className="v1-kb-qa-tags">
                      <span className="v1-chip">{qz.label}</span>
                    </span>
                    <span className="v1-list-title v1-list-title--wrap">{qz.question}</span>
                    <span className="v1-kb-qa-answer">{qz.answer}</span>
                  </span>
                  <span className="v1-list-end">
                    <button
                      type="button"
                      className="v1-menu-btn v1-kb-iconbtn--danger"
                      onClick={() => setConfirmQuizDoc(qz.documentId)}
                      aria-label={`Verwijderen: ${qz.question}`}
                      title="Verwijderen"
                    >
                      <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </List>
        </section>
      ) : null}

      {confirmQuizDoc ? (
        <ConfirmDialog
          title="Quiz-antwoord verwijderen?"
          body="Je chatbot gebruikt dit antwoord daarna niet meer."
          confirmLabel="Verwijderen"
          onCancel={cancelQuizDelete}
          onConfirm={removeQuizDoc}
        />
      ) : null}

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
