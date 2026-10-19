'use client';

// V1 Gesprekken › "Wist je chatbot niet": de werklijst van onbeantwoorde vragen.
//
// Eén rij per vraag (gegroepeerd op dezelfde vraag, met "N× gevraagd"), uit de
// gedeelde definitie (lib/v1/dashboard/unanswered-core.ts). Per open vraag:
//   - "Beantwoord" opent een zijpaneel met de bestaande Q&A-opslaan-flow
//     (addQAFromTopQuestionAction → upsertQAItemAction, org uit de sessie);
//   - "Markeer als opgelost" (alleen als de vraag uit een bezoekersgesprek komt).
// Afgehandelde vragen staan eronder met hoe ze zijn afgehandeld. Na opslaan een
// bevestiging met een knop naar de testchat (QASavedNotice).

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { addQAFromTopQuestionAction } from '../top-questions-actions';
import { markQuestionResolvedAction } from '../actions';
import { CurrentBotAnswer } from '@/app/v1/app/kennisbank/qa/current-bot-answer';
import { QASavedNotice } from '@/app/v1/app/kennisbank/qa/qa-saved-notice';
import { List, ListRow } from '@/app/v1/_ui/list';
import { Badge, EmptyState } from '@/app/v1/_ui/feedback';
import { Button } from '@/app/v1/_ui/button';
import { Drawer } from '@/app/v1/_ui/drawer';
import { Field } from '@/app/v1/_ui/controls';
import { useToast } from '@/app/v1/_ui/toast';
import { formatShort } from '../_conversation/format';

export type UnansweredRow = {
  key: string;
  question: string;
  occurrences: number;
  lastSeenAt: string;
  status: 'open' | 'answered' | 'qa' | 'resolved';
  qaExists: boolean;
  threadIds: string[];
};

const DONE_LABEL: Record<Exclude<UnansweredRow['status'], 'open'>, string> = {
  qa: 'Beantwoord via Q&A',
  answered: 'Later wel beantwoord',
  resolved: 'Opgelost',
};

export function UnansweredTab({ questions }: { questions: UnansweredRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [drafting, setDrafting] = useState<{ key: string; question: string; answer: string } | null>(null);
  const [saved, setSaved] = useState<{ question: string; notIngested: boolean } | null>(null);
  const [doneKeys, setDoneKeys] = useState<Map<string, UnansweredRow['status']>>(() => new Map());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [, startResolve] = useTransition();

  const closeDraft = useCallback(() => setDrafting(null), []);
  const closeSaved = useCallback(() => setSaved(null), []);

  // Optimistisch: een net afgehandelde vraag schuift meteen naar "Afgehandeld";
  // router.refresh() haalt daarna de echte (afgeleide) status op.
  const rows = questions.map((q) => (doneKeys.has(q.key) ? { ...q, status: doneKeys.get(q.key)! } : q));
  const open = rows.filter((q) => q.status === 'open');
  const done = rows.filter((q) => q.status !== 'open');

  function save() {
    if (!drafting) return;
    const question = drafting.question.trim();
    if (!question || !drafting.answer.trim()) return;
    const key = drafting.key;
    startSave(async () => {
      const res = await addQAFromTopQuestionAction(question, drafting.answer);
      if (res.ok) {
        setDrafting(null);
        setSaved({ question, notIngested: res.notIngested === true });
        if (!res.notIngested) setDoneKeys((m) => new Map(m).set(key, 'qa'));
        router.refresh();
      } else {
        toast.error(res.error ?? 'Kon de Q&A niet opslaan.');
      }
    });
  }

  function resolve(q: UnansweredRow) {
    setBusyKey(q.key);
    startResolve(async () => {
      const res = await markQuestionResolvedAction(q.question);
      setBusyKey(null);
      if (res.ok) {
        setDoneKeys((m) => new Map(m).set(q.key, 'resolved'));
        toast.success('Gemarkeerd als opgelost');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Er ging iets mis. Probeer het opnieuw.');
      }
    });
  }

  return (
    <div className="v1-stack">
      {saved ? <QASavedNotice question={saved.question} notIngested={saved.notIngested} onClose={closeSaved} /> : null}

      <p className="v1-hint">
        Vragen van de laatste 30 dagen waar je chatbot geen antwoord op had. Vragen buiten je vakgebied staan er niet
        tussen. Geef een antwoord, dan gebruikt je chatbot het voortaan.
      </p>

      <section className="v1-card v1-gs-listcard v1-gs-faq" aria-label="Nog te beantwoorden">
        {open.length === 0 ? (
          <EmptyState>Alles afgehandeld. Wat je chatbot niet weet, verschijnt hier.</EmptyState>
        ) : (
          <List label="Nog te beantwoorden">
            {open.map((q) => {
              const meta = [
                `${q.occurrences}× gevraagd`,
                q.lastSeenAt ? `laatst ${formatShort(q.lastSeenAt)}` : null,
                q.qaExists ? 'er is al een Q&A, maar je chatbot wist het daarna nog niet' : null,
              ]
                .filter(Boolean)
                .join(' · ');
              const latestThread = q.threadIds[0];
              return (
                <ListRow
                  key={q.key}
                  wrap
                  title={q.question}
                  meta={meta}
                  end={
                    <>
                      {latestThread ? (
                        <Link
                          href={`/v1/app/gesprekken/${latestThread}`}
                          scroll={false}
                          className="v1-link v1-gs-unanswered-link"
                        >
                          Gesprek
                        </Link>
                      ) : null}
                      {q.threadIds.length > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busyKey === q.key}
                          onClick={() => resolve(q)}
                        >
                          Markeer als opgelost
                        </Button>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDrafting({ key: q.key, question: q.question, answer: '' })}
                      >
                        Beantwoord
                      </Button>
                    </>
                  }
                />
              );
            })}
          </List>
        )}
      </section>

      {done.length > 0 ? (
        <section className="v1-card v1-gs-listcard" aria-label="Afgehandeld">
          <p className="v1-gs-unanswered-head">Afgehandeld</p>
          <List label="Afgehandeld">
            {done.map((q) => (
              <ListRow
                key={q.key}
                wrap
                title={q.question}
                meta={[`${q.occurrences}× gevraagd`, q.lastSeenAt ? `laatst ${formatShort(q.lastSeenAt)}` : null]
                  .filter(Boolean)
                  .join(' · ')}
                end={
                  <Badge tone="ok">
                    <Check size={12} strokeWidth={2.4} aria-hidden="true" />
                    {DONE_LABEL[q.status as Exclude<UnansweredRow['status'], 'open'>]}
                  </Badge>
                }
              />
            ))}
          </List>
        </section>
      ) : null}

      {drafting ? (
        <Drawer
          title="Beantwoord deze vraag"
          onClose={closeDraft}
          footer={
            <>
              <Button variant="ghost" onClick={closeDraft} disabled={saving}>
                Annuleren
              </Button>
              <Button onClick={save} loading={saving} disabled={!drafting.question.trim() || !drafting.answer.trim()}>
                Opslaan als Q&amp;A
              </Button>
            </>
          }
        >
          <p className="v1-hint">
            Schrijf het antwoord dat je chatbot voortaan geeft. Het komt in je Q&amp;A in de kennisbank.
          </p>
          <Field label="Vraag">
            {(id) => (
              <input
                id={id}
                className="v1-input"
                value={drafting.question}
                onChange={(e) => setDrafting({ ...drafting, question: e.target.value })}
              />
            )}
          </Field>
          <CurrentBotAnswer question={drafting.question} />
          <Field label="Antwoord">
            {(id) => (
              <textarea
                id={id}
                className="v1-input"
                rows={5}
                autoFocus
                value={drafting.answer}
                onChange={(e) => setDrafting({ ...drafting, answer: e.target.value })}
                placeholder="Het antwoord dat je chatbot voortaan geeft"
              />
            )}
          </Field>
        </Drawer>
      ) : null}
    </div>
  );
}
