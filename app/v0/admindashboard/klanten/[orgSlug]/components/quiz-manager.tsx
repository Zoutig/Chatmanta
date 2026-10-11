'use client';

// Operator-UI voor de Kennisbank-Quiz (M3). Per quiz-status een ander paneel:
//  - geen quiz / leeg / mislukt → trigger-paneel (model-keuze + genereer-knop)
//  - concept                    → goedkeur-scherm (approve/bewerk/verwijder/voeg toe + activeren)
//  - actief / voltooid          → statistieken + read-only vragen
// De genereer-call draait synchroon (~15-60s); maxDuration=120 op de route dekt dit.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  activateQuizAction,
  addQuizQuestionAction,
  cancelQuizAction,
  deleteQuizQuestionAction,
  setQuizQuestionApprovedAction,
  triggerQuizAnalysisAction,
  updateQuizQuestionAction,
} from '@/app/actions/controlroom';
import {
  QUIZ_ANALYSE_MODELS,
  QUIZ_ANALYSE_MODEL_LABELS,
  QUIZ_STATUS_LABELS,
  type QuizAnalyseModel,
  type QuizItem,
  type QuizQuestion,
  type QuizQuestionType,
} from '@/lib/controlroom/types';

type ActResult = { ok: boolean; error?: string };

function optiesToText(opties: string[] | null): string {
  return (opties ?? []).join('\n');
}
function textToOpties(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
}

export function QuizManager({
  orgSlug,
  quiz,
  questions,
}: {
  orgSlug: string;
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
    <div className="klant-card" style={{ borderColor: 'var(--klant-danger)', color: 'var(--klant-danger)', fontSize: 13 }}>
      {error}
    </div>
  ) : null;

  // ── Trigger-paneel (geen quiz / leeg / mislukt) ────────────────────────────
  const showTrigger = !quiz || quiz.status === 'leeg' || quiz.status === 'mislukt' || quiz.status === 'generating';
  if (showTrigger) {
    const isRetry = !!quiz && (quiz.status === 'mislukt' || quiz.status === 'leeg');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {errorBar}
        <div className="klant-card">
          <div className="klant-section-title" style={{ marginBottom: 8 }}>Kennisbank-Quiz</div>
          {quiz?.status === 'leeg' && (
            <p className="klant-hint" style={{ marginTop: 0 }}>
              De vorige analyse vond geen duidelijke gaten — de kennisbank lijkt volledig. Je kunt opnieuw genereren.
            </p>
          )}
          {quiz?.status === 'mislukt' && (
            <p className="klant-hint" style={{ marginTop: 0, color: 'var(--klant-danger)' }}>
              De vorige analyse is mislukt{quiz.error ? `: ${quiz.error}` : ''}. Probeer het opnieuw.
            </p>
          )}
          {quiz?.status === 'generating' && (
            <p className="klant-hint" style={{ marginTop: 0 }}>
              Een analyse lijkt te zijn afgebroken (status: bezig). Start opnieuw om verder te gaan.
            </p>
          )}
          {!quiz && (
            <p className="klant-hint" style={{ marginTop: 0 }}>
              De AI analyseert de kennisbank van deze klant, bepaalt welke informatie ontbreekt en genereert
              quizvragen. Jij beoordeelt ze daarna voordat de klant ze ziet.
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="klant-label">Model</span>
              <select
                className="klant-select"
                style={{ width: 'auto', minWidth: 220 }}
                value={model}
                disabled={pending}
                onChange={(e) => setModel(e.target.value as QuizAnalyseModel)}
              >
                {QUIZ_ANALYSE_MODELS.map((m) => (
                  <option key={m} value={m}>{QUIZ_ANALYSE_MODEL_LABELS[m]}</option>
                ))}
              </select>
            </label>
            <button
              className="klant-btn"
              data-variant="primary"
              disabled={pending}
              onClick={() => run(() => triggerQuizAnalysisAction(orgSlug, model))}
            >
              {pending ? 'Bezig met analyseren… (tot ~1 min)' : isRetry ? 'Opnieuw genereren' : 'Genereer quiz'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Actief / voltooid → stats + read-only ──────────────────────────────────
  if (quiz.status === 'actief' || quiz.status === 'voltooid') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {errorBar}
        <div className="klant-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="klant-section-title">Quiz {QUIZ_STATUS_LABELS[quiz.status]}</div>
              <p className="klant-hint" style={{ margin: '4px 0 0' }}>
                {quiz.questionCount} vragen · {quiz.answeredCount} beantwoord · {quiz.skippedCount} overgeslagen
              </p>
            </div>
            {quiz.status === 'actief' && (
              <button
                className="klant-btn"
                data-variant="ghost"
                disabled={pending}
                onClick={() => run(() => cancelQuizAction(orgSlug, quiz.id))}
              >
                Quiz annuleren
              </button>
            )}
          </div>
        </div>
        <QuestionList questions={questions} readOnly />
      </div>
    );
  }

  // ── Concept → goedkeur-scherm ──────────────────────────────────────────────
  const visible = questions.filter((q) => !q.verwijderd);
  const approvedCount = visible.filter((q) => q.goedgekeurd).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {errorBar}
      <div className="klant-card">
        <div className="klant-section-title" style={{ marginBottom: 6 }}>Concept — wacht op jouw goedkeuring</div>
        {(quiz.bedrijfscontext?.branche || quiz.bedrijfscontext?.beschrijving) && (
          <p className="klant-hint" style={{ marginTop: 0 }}>
            Gedetecteerd: <strong>{quiz.bedrijfscontext.branche ?? '—'}</strong>
            {quiz.bedrijfscontext.doelgroep ? ` · doelgroep: ${quiz.bedrijfscontext.doelgroep}` : ''}
          </p>
        )}
        <p className="klant-hint" style={{ marginTop: 0 }}>
          {visible.length} vragen · {approvedCount} goedgekeurd. Keur minimaal één vraag goed en activeer dan de quiz.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button
            className="klant-btn"
            data-variant="primary"
            disabled={pending || approvedCount === 0}
            onClick={() => run(() => activateQuizAction(orgSlug, quiz.id))}
          >
            Quiz activeren ({approvedCount})
          </button>
          <button
            className="klant-btn"
            data-variant="ghost"
            disabled={pending}
            onClick={() => run(() => triggerQuizAnalysisAction(orgSlug, model))}
          >
            Opnieuw genereren
          </button>
          <button
            className="klant-btn"
            data-variant="ghost"
            disabled={pending}
            onClick={() => run(() => cancelQuizAction(orgSlug, quiz.id))}
          >
            Annuleren
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((q) => (
          <ConceptQuestionCard
            key={q.id}
            orgSlug={orgSlug}
            quizId={quiz.id}
            question={q}
            pending={pending}
            run={run}
          />
        ))}
      </div>

      <AddQuestionForm orgSlug={orgSlug} quizId={quiz.id} pending={pending} run={run} />
    </div>
  );
}

// ── Read-only vragenlijst (actief/voltooid) ──────────────────────────────────
function QuestionList({ questions, readOnly: _readOnly }: { questions: QuizQuestion[]; readOnly: boolean }) {
  const visible = questions.filter((q) => !q.verwijderd && q.goedgekeurd);
  if (visible.length === 0) return <div className="klant-card"><span className="klant-hint">Geen actieve vragen.</span></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {visible.map((q) => (
        <div key={q.id} className="klant-card">
          <div style={{ fontSize: 11, color: 'var(--klant-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {q.categorieLabel ?? q.categorie} · {q.type}
          </div>
          {q.context && <div style={{ fontSize: 12.5, color: 'var(--klant-dim)', marginTop: 4 }}>{q.context}</div>}
          <div style={{ fontSize: 14, marginTop: 4 }}>{q.vraag}</div>
          {q.opties && q.opties.length > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--klant-muted)', marginTop: 4 }}>{q.opties.join(' · ')}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Bewerkbare vraag-kaart (concept) ─────────────────────────────────────────
function ConceptQuestionCard({
  orgSlug,
  quizId,
  question,
  pending,
  run,
}: {
  orgSlug: string;
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
      updateQuizQuestionAction(orgSlug, question.id, {
        vraag: vraag.trim(),
        context: context.trim() || null,
        opties: question.type === 'meerkeuze' ? textToOpties(optiesText) : null,
      }),
    );
    setEditing(false);
  }

  return (
    <div className="klant-card" style={{ opacity: question.goedgekeurd ? 1 : 0.82 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, whiteSpace: 'nowrap', paddingTop: 2 }}>
          <input
            type="checkbox"
            checked={question.goedgekeurd}
            disabled={pending}
            onChange={(e) => run(() => setQuizQuestionApprovedAction(orgSlug, question.id, e.target.checked))}
          />
          Goedgekeurd
        </label>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--klant-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {question.categorieLabel ?? question.categorie} · {question.type} {question.bron === 'niels' ? '· handmatig' : ''}
          </div>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              <input className="klant-input" value={context} placeholder="Contextzin (optioneel)" disabled={pending} onChange={(e) => setContext(e.target.value)} />
              <textarea className="klant-textarea" rows={2} value={vraag} disabled={pending} onChange={(e) => setVraag(e.target.value)} />
              {question.type === 'meerkeuze' && (
                <textarea className="klant-textarea" rows={3} value={optiesText} placeholder="Eén optie per regel" disabled={pending} onChange={(e) => setOptiesText(e.target.value)} />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="klant-btn" data-variant="primary" disabled={pending || vraag.trim().length === 0} onClick={save}>Opslaan</button>
                <button className="klant-btn" data-variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Annuleren</button>
              </div>
            </div>
          ) : (
            <>
              {question.context && <div style={{ fontSize: 12.5, color: 'var(--klant-dim)', marginTop: 4 }}>{question.context}</div>}
              <div style={{ fontSize: 14, marginTop: 4 }}>{question.vraag}</div>
              {question.opties && question.opties.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--klant-muted)', marginTop: 4 }}>{question.opties.join(' · ')}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="klant-btn" data-variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={pending} onClick={() => setEditing(true)}>Bewerken</button>
                <button className="klant-btn" data-variant="ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--klant-danger)' }} disabled={pending} onClick={() => run(() => deleteQuizQuestionAction(orgSlug, quizId, question.id))}>Verwijderen</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Handmatig vraag toevoegen ────────────────────────────────────────────────
function AddQuestionForm({
  orgSlug,
  quizId,
  pending,
  run,
}: {
  orgSlug: string;
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
      addQuizQuestionAction(orgSlug, quizId, {
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
      <button className="klant-btn" data-variant="ghost" disabled={pending} onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}>
        + Vraag toevoegen
      </button>
    );
  }
  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="klant-section-title">Vraag toevoegen</div>
      <input className="klant-input" value={categorie} placeholder="Categorie (bv. Prijzen)" disabled={pending} onChange={(e) => setCategorie(e.target.value)} />
      <input className="klant-input" value={context} placeholder="Contextzin (optioneel)" disabled={pending} onChange={(e) => setContext(e.target.value)} />
      <textarea className="klant-textarea" rows={2} value={vraag} placeholder="De vraag" disabled={pending} onChange={(e) => setVraag(e.target.value)} />
      <select className="klant-select" style={{ width: 'auto' }} value={type} disabled={pending} onChange={(e) => setType(e.target.value as QuizQuestionType)}>
        <option value="open">Open vraag</option>
        <option value="meerkeuze">Meerkeuze</option>
      </select>
      {type === 'meerkeuze' && (
        <textarea className="klant-textarea" rows={3} value={optiesText} placeholder="Eén optie per regel" disabled={pending} onChange={(e) => setOptiesText(e.target.value)} />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="klant-btn" data-variant="primary" disabled={pending || vraag.trim().length === 0} onClick={add}>Toevoegen</button>
        <button className="klant-btn" data-variant="ghost" disabled={pending} onClick={reset}>Annuleren</button>
      </div>
    </div>
  );
}
