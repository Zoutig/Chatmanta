'use client';

// V1 operator-UI voor de Kennisbank-Quiz. Port van
// app/admindashboard/klanten/[orgSlug]/components/quiz-manager.tsx.
// Werkt op orgId (UUID) i.p.v. orgSlug; actions uit app/v1/admin/quiz/actions.ts.
// Presentatie in de V1-ontwerplaag (golf 4b); stappen en acties ongewijzigd.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  activateQuizAction,
  addQuizQuestionAction,
  cancelQuizAction,
  deleteQuizQuestionAction,
  generateQuizForOrgAction,
  setQuizQuestionApprovedAction,
  updateQuizQuestionAction,
} from '../actions';
import {
  QUIZ_ANALYSE_MODELS,
  QUIZ_ANALYSE_MODEL_LABELS,
  QUIZ_STATUS_LABELS,
  type QuizAnalyseModel,
  type QuizItem,
  type QuizQuestion,
  type QuizQuestionType,
} from '@/lib/controlroom/types';
import { Button } from '@/app/v1/_ui/button';
import { Field, Switch } from '@/app/v1/_ui/controls';
import { EmptyState } from '@/app/v1/_ui/feedback';

type ActResult = { ok: boolean; error?: string };

function optiesToText(opties: string[] | null): string {
  return (opties ?? []).join('\n');
}
function textToOpties(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
}

// De lib-labels bevatten een em-dash; in de UI tonen we een komma.
function modelLabel(m: QuizAnalyseModel): string {
  return QUIZ_ANALYSE_MODEL_LABELS[m].replace(/\s+—\s+/g, ', ');
}

const TYPE_LABELS: Record<string, string> = {
  open: 'Open vraag',
  meerkeuze: 'Meerkeuze',
};

function QuestionMeta({ question }: { question: QuizQuestion }) {
  return (
    <p className="v1-list-meta" style={{ margin: 0 }}>
      {question.categorieLabel ?? question.categorie} · {TYPE_LABELS[question.type] ?? question.type}
      {question.bron === 'niels' ? ' · handmatig' : ''}
    </p>
  );
}

function QuestionBody({ question }: { question: QuizQuestion }) {
  return (
    <>
      {question.context ? (
        <p className="v1-hint" style={{ margin: '4px 0 0' }}>
          {question.context}
        </p>
      ) : null}
      <p className="v1-adm-strong" style={{ margin: '4px 0 0' }}>
        {question.vraag}
      </p>
      {question.opties && question.opties.length > 0 ? (
        <p className="v1-adm-muted" style={{ margin: '4px 0 0' }}>
          {question.opties.join(' · ')}
        </p>
      ) : null}
    </>
  );
}

export function QuizManager({
  orgId,
  quiz,
  questions,
}: {
  orgId: string;
  quiz: QuizItem | null;
  questions: QuizQuestion[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<QuizAnalyseModel>(quiz?.analyseModel ?? 'gpt-4o-mini');

  function run(fn: () => Promise<ActResult>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Er ging iets mis.');
    });
  }

  const errorBar = error ? (
    <p role="alert" className="v1-alert v1-alert--error">
      {error}
    </p>
  ) : null;

  // ── Trigger-paneel (geen quiz / leeg / mislukt / generating) ────────────────
  const showTrigger = !quiz || quiz.status === 'leeg' || quiz.status === 'mislukt' || quiz.status === 'generating';
  if (showTrigger) {
    const isRetry = !!quiz && (quiz.status === 'mislukt' || quiz.status === 'leeg');
    return (
      <>
        {errorBar}
        <section className="v1-card">
          <h2 className="v1-section-title">Quiz genereren</h2>
          {quiz?.status === 'leeg' && (
            <p className="v1-hint">
              De vorige analyse vond geen duidelijke gaten. De kennisbank lijkt volledig. Je kunt opnieuw genereren.
            </p>
          )}
          {quiz?.status === 'mislukt' && (
            <p role="alert" className="v1-alert v1-alert--error">
              De vorige analyse is mislukt{quiz.error ? `: ${quiz.error}` : ''}. Probeer het opnieuw.
            </p>
          )}
          {quiz?.status === 'generating' && (
            <p className="v1-hint">Een analyse lijkt te zijn afgebroken (status: bezig). Start opnieuw om verder te gaan.</p>
          )}
          {!quiz && (
            <p className="v1-hint">
              De AI zoekt welke informatie in de kennisbank van deze klant ontbreekt en maakt daar quizvragen van. Jij
              beoordeelt ze voordat de klant ze ziet.
            </p>
          )}
          <div className="v1-form" style={{ marginTop: 14 }}>
            <Field label="Model">
              {(id) => (
                <select
                  id={id}
                  className="v1-input v1-adm-select"
                  value={model}
                  disabled={pending}
                  onChange={(e) => setModel(e.target.value as QuizAnalyseModel)}
                >
                  {QUIZ_ANALYSE_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {modelLabel(m)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div>
              <Button variant="primary" loading={pending} onClick={() => run(() => generateQuizForOrgAction(orgId, model))}>
                {pending ? 'Bezig met analyseren (tot ongeveer 1 minuut)' : isRetry ? 'Opnieuw genereren' : 'Genereer quiz'}
              </Button>
            </div>
          </div>
        </section>
      </>
    );
  }

  // ── Actief / voltooid → stats + read-only ───────────────────────────────────
  if (quiz.status === 'actief' || quiz.status === 'voltooid') {
    return (
      <>
        {errorBar}
        <section className="v1-card">
          <div className="v1-adm-card-head" style={{ flexWrap: 'wrap', alignItems: 'center', marginBottom: 0 }}>
            <div>
              <h2 className="v1-section-title">Quiz {QUIZ_STATUS_LABELS[quiz.status].toLowerCase()}</h2>
              <p className="v1-hint" style={{ margin: '4px 0 0' }}>
                {quiz.questionCount} vragen · {quiz.answeredCount} beantwoord · {quiz.skippedCount} overgeslagen
              </p>
            </div>
            {quiz.status === 'actief' && (
              <Button variant="secondary" disabled={pending} onClick={() => run(() => cancelQuizAction(orgId, quiz.id))}>
                Quiz annuleren
              </Button>
            )}
          </div>
        </section>
        <QuestionList questions={questions} readOnly />
      </>
    );
  }

  // ── Concept → goedkeur-scherm ────────────────────────────────────────────────
  const visible = questions.filter((q) => !q.verwijderd);
  const approvedCount = visible.filter((q) => q.goedgekeurd).length;
  return (
    <>
      {errorBar}
      <section className="v1-card">
        <h2 className="v1-section-title">Concept, wacht op jouw goedkeuring</h2>
        {(quiz.bedrijfscontext?.branche || quiz.bedrijfscontext?.beschrijving) && (
          <p className="v1-hint">
            Gedetecteerd: <strong>{quiz.bedrijfscontext.branche ?? 'Onbekend'}</strong>
            {quiz.bedrijfscontext.doelgroep ? ` · doelgroep: ${quiz.bedrijfscontext.doelgroep}` : ''}
          </p>
        )}
        <p className="v1-hint">
          {visible.length} vragen · {approvedCount} goedgekeurd. Keur minimaal een vraag goed en activeer dan de quiz.
        </p>
        <div className="v1-adm-inline" style={{ marginTop: 12 }}>
          <Button
            variant="primary"
            disabled={pending || approvedCount === 0}
            onClick={() => run(() => activateQuizAction(orgId, quiz.id))}
          >
            Quiz activeren ({approvedCount})
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => run(() => generateQuizForOrgAction(orgId, model))}>
            Opnieuw genereren
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => run(() => cancelQuizAction(orgId, quiz.id))}>
            Annuleren
          </Button>
        </div>
      </section>

      {visible.map((q) => (
        <ConceptQuestionCard key={q.id} orgId={orgId} quizId={quiz.id} question={q} pending={pending} run={run} />
      ))}

      <AddQuestionForm orgId={orgId} quizId={quiz.id} pending={pending} run={run} />
    </>
  );
}

// ── Read-only vragenlijst (actief/voltooid) ──────────────────────────────────
function QuestionList({ questions, readOnly: _readOnly }: { questions: QuizQuestion[]; readOnly: boolean }) {
  const visible = questions.filter((q) => !q.verwijderd && q.goedgekeurd);
  if (visible.length === 0) {
    return (
      <section className="v1-card">
        <EmptyState>Geen actieve vragen.</EmptyState>
      </section>
    );
  }
  return (
    <section className="v1-card">
      <h2 className="v1-section-title">Vragen</h2>
      <ul className="v1-list" aria-label="Quizvragen">
        {visible.map((q) => (
          <li key={q.id} style={{ padding: '13px 0' }}>
            <QuestionMeta question={q} />
            <QuestionBody question={q} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Bewerkbare vraag-kaart (concept) ─────────────────────────────────────────
function ConceptQuestionCard({
  orgId,
  quizId,
  question,
  pending,
  run,
}: {
  orgId: string;
  quizId: string;
  question: QuizQuestion;
  pending: boolean;
  run: (fn: () => Promise<ActResult>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [vraag, setVraag] = useState(question.vraag);
  const [context, setContext] = useState(question.context ?? '');
  const [optiesText, setOptiesText] = useState(optiesToText(question.opties));

  function save() {
    run(() =>
      updateQuizQuestionAction(orgId, question.id, {
        vraag: vraag.trim(),
        context: context.trim() || null,
        opties: question.type === 'meerkeuze' ? textToOpties(optiesText) : null,
      }),
    );
    setEditing(false);
  }

  return (
    <section className="v1-card" style={{ opacity: question.goedgekeurd ? 1 : 0.82 }}>
      <Switch
        label="Goedgekeurd"
        checked={question.goedgekeurd}
        disabled={pending}
        onChange={(next) => run(() => setQuizQuestionApprovedAction(orgId, question.id, next))}
      />
      <div className="v1-adm-divider" />
      <QuestionMeta question={question} />
      {editing ? (
        <div className="v1-form" style={{ marginTop: 10 }}>
          <Field label="Contextzin (optioneel)">
            {(id) => (
              <input id={id} className="v1-input" value={context} disabled={pending} onChange={(e) => setContext(e.target.value)} />
            )}
          </Field>
          <Field label="Vraag">
            {(id) => (
              <textarea
                id={id}
                className="v1-input"
                rows={2}
                value={vraag}
                disabled={pending}
                onChange={(e) => setVraag(e.target.value)}
              />
            )}
          </Field>
          {question.type === 'meerkeuze' && (
            <Field label="Opties" hint="Een optie per regel.">
              {(id) => (
                <textarea
                  id={id}
                  className="v1-input"
                  rows={3}
                  value={optiesText}
                  disabled={pending}
                  onChange={(e) => setOptiesText(e.target.value)}
                />
              )}
            </Field>
          )}
          <div className="v1-adm-inline">
            <Button variant="primary" size="sm" disabled={pending || vraag.trim().length === 0} onClick={save}>
              Opslaan
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(false)}>
              Annuleren
            </Button>
          </div>
        </div>
      ) : (
        <>
          <QuestionBody question={question} />
          <div className="v1-adm-inline" style={{ marginTop: 10 }}>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => setEditing(true)}>
              Bewerken
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="v1-adm-danger"
              disabled={pending}
              onClick={() => run(() => deleteQuizQuestionAction(orgId, quizId, question.id))}
            >
              Verwijderen
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

// ── Handmatig vraag toevoegen ────────────────────────────────────────────────
function AddQuestionForm({
  orgId,
  quizId,
  pending,
  run,
}: {
  orgId: string;
  quizId: string;
  pending: boolean;
  run: (fn: () => Promise<ActResult>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [categorie, setCategorie] = useState('');
  const [vraag, setVraag] = useState('');
  const [context, setContext] = useState('');
  const [type, setType] = useState<QuizQuestionType>('open');
  const [optiesText, setOptiesText] = useState('');

  function reset() {
    setCategorie(''); setVraag(''); setContext(''); setType('open'); setOptiesText(''); setOpen(false);
  }
  function add() {
    run(() =>
      addQuizQuestionAction(orgId, quizId, {
        categorie: categorie.trim() || 'overig',
        categorieLabel: categorie.trim() || null,
        context: context.trim() || null,
        vraag: vraag.trim(),
        type,
        opties: type === 'meerkeuze' ? textToOpties(optiesText) : null,
      }),
    );
    reset();
  }

  if (!open) {
    return (
      <div>
        <Button variant="secondary" disabled={pending} onClick={() => setOpen(true)}>
          Vraag toevoegen
        </Button>
      </div>
    );
  }
  return (
    <section className="v1-card">
      <h2 className="v1-section-title">Vraag toevoegen</h2>
      <div className="v1-form" style={{ marginTop: 10 }}>
        <Field label="Categorie" hint="Bijvoorbeeld Prijzen.">
          {(id) => (
            <input id={id} className="v1-input" value={categorie} disabled={pending} onChange={(e) => setCategorie(e.target.value)} />
          )}
        </Field>
        <Field label="Contextzin (optioneel)">
          {(id) => (
            <input id={id} className="v1-input" value={context} disabled={pending} onChange={(e) => setContext(e.target.value)} />
          )}
        </Field>
        <Field label="Vraag">
          {(id) => (
            <textarea id={id} className="v1-input" rows={2} value={vraag} disabled={pending} onChange={(e) => setVraag(e.target.value)} />
          )}
        </Field>
        <Field label="Soort vraag">
          {(id) => (
            <select
              id={id}
              className="v1-input v1-adm-select"
              value={type}
              disabled={pending}
              onChange={(e) => setType(e.target.value as QuizQuestionType)}
            >
              <option value="open">Open vraag</option>
              <option value="meerkeuze">Meerkeuze</option>
            </select>
          )}
        </Field>
        {type === 'meerkeuze' && (
          <Field label="Opties" hint="Een optie per regel.">
            {(id) => (
              <textarea
                id={id}
                className="v1-input"
                rows={3}
                value={optiesText}
                disabled={pending}
                onChange={(e) => setOptiesText(e.target.value)}
              />
            )}
          </Field>
        )}
        <div className="v1-adm-inline">
          <Button variant="primary" disabled={pending || vraag.trim().length === 0} onClick={add}>
            Toevoegen
          </Button>
          <Button variant="ghost" disabled={pending} onClick={reset}>
            Annuleren
          </Button>
        </div>
      </div>
    </section>
  );
}
