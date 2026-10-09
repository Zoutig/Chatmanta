'use client';

// V1 Klantendashboard: tab "Meest gestelde vragen" (spec 7.3, bijlage A
// "Gesprekken › Meest gesteld"). Zelfde lijststijl als Alle gesprekken.
//
// Functioneel gelijk aan de vorige versie: ranglijst uit de FAQ-snapshot,
// "Gesprekken" toont in een zijpaneel de gesprekken waarin de vraag viel,
// "Maak Q&A" opent een zijpaneel om een antwoord vast te leggen (met "wat zegt
// de bot nu"), en de ranglijst-instellingen staan eronder. Opbouwend/leeg is
// één compacte regel; opslaan bevestigt met een Toast.

import { useCallback, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import {
  addQAFromTopQuestionAction,
  getConversationsForQuestionAction,
  type QuestionConversationHit,
} from '../top-questions-actions';
import { CurrentBotAnswer } from '@/app/voorbeeld/(dashboard)/kennisbank/qa/current-bot-answer';
import { List, ListRow } from '@/app/v1/_ui/list';
import { Badge, EmptyState } from '@/app/v1/_ui/feedback';
import { Button } from '@/app/v1/_ui/button';
import { Drawer } from '@/app/v1/_ui/drawer';
import { Field } from '@/app/v1/_ui/controls';
import { Skeleton } from '@/app/v1/_ui/skeleton';
import { useToast } from '@/app/v1/_ui/toast';
import { formatShort } from '../_conversation/format';
import { TopQuestionsConfigCard } from './top-questions-config-card';
import type { KlantFaqRow } from '@/lib/v1/dashboard/faq';
import type { TopQuestionsConfig } from '@/lib/v0/klantendashboard/types';

export function TopQuestionsTab({
  initial,
  existingQAQuestions = [],
  config,
  totalUnique,
  pending: snapshotPending,
  generatedAt,
}: {
  initial: KlantFaqRow[];
  existingQAQuestions?: string[];
  config: TopQuestionsConfig;
  totalUnique: number;
  pending: boolean;
  generatedAt: string | null;
}) {
  const items = initial;
  const toast = useToast();
  const [drafting, setDrafting] = useState<{ question: string; answer: string } | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(
    () => new Set(existingQAQuestions.map((q) => q.trim().toLowerCase())),
  );
  const [saving, startSave] = useTransition();

  const [drilldown, setDrilldown] = useState<KlantFaqRow | null>(null);
  const [hits, setHits] = useState<QuestionConversationHit[] | null>(null);
  const [, startDrilldown] = useTransition();
  const drilldownReqRef = useRef(0);

  // Stabiele sluit-handlers: de Drawer herstart focus/scroll-lock bij een nieuwe onClose.
  const closeDrilldown = useCallback(() => setDrilldown(null), []);
  const closeDraft = useCallback(() => setDrafting(null), []);

  function openDrilldown(row: KlantFaqRow) {
    const reqId = ++drilldownReqRef.current;
    setDrilldown(row);
    setHits(null);
    startDrilldown(async () => {
      const res = await getConversationsForQuestionAction(row.memberQuestions);
      if (drilldownReqRef.current !== reqId) return;
      setHits(res.ok ? res.hits : []);
    });
  }

  function save() {
    if (!drafting) return;
    const question = drafting.question.trim();
    if (!question || !drafting.answer.trim()) return;
    startSave(async () => {
      const res = await addQAFromTopQuestionAction(drafting.question, drafting.answer);
      if (res.ok) {
        setSavedKeys((prev) => new Set(prev).add(question.toLowerCase()));
        setDrafting(null);
        toast.success('Toegevoegd aan je Q&A');
      } else {
        toast.error(res.error ?? 'Kon de Q&A niet opslaan.');
      }
    });
  }

  const configCard = <TopQuestionsConfigCard initial={config} />;

  if (snapshotPending || items.length === 0) {
    let line: string;
    if (snapshotPending) line = 'De ranglijst wordt nog opgebouwd. Kijk later nog eens.';
    else if (totalUnique > 0)
      line = `Nog geen vraag is ${config.minCount}× of vaker gesteld. Verlaag de drempel of wacht nog even.`;
    else line = 'Nog geen vragen geteld. Zodra bezoekers vragen stellen, zie je hier welke het vaakst terugkomen.';
    return (
      <div className="v1-stack">
        <section className="v1-card v1-gs-listcard" aria-label="Meest gestelde vragen">
          <EmptyState>{line}</EmptyState>
        </section>
        {configCard}
      </div>
    );
  }

  return (
    <div className="v1-stack">
      <p className="v1-hint">
        Vragen die minstens {config.minCount}× zijn gesteld, gegroepeerd op betekenis · top {items.length} van
        max {config.topN}
        {generatedAt ? ` · bijgewerkt ${formatShort(generatedAt)}` : ''}
      </p>

      <section className="v1-card v1-gs-listcard v1-gs-faq" aria-label="Meest gestelde vragen">
        <List label="Meest gestelde vragen">
          {items.map((q) => {
            const key = q.question.trim().toLowerCase();
            const inQA = savedKeys.has(key);
            const meta = [
              `${q.count}× gesteld`,
              q.paraphraseCount > 0
                ? `+${q.paraphraseCount} andere ${q.paraphraseCount === 1 ? 'formulering' : 'formuleringen'}`
                : null,
              q.lastAskedAt ? `laatst ${formatShort(q.lastAskedAt)}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <ListRow
                key={key}
                wrap
                title={q.question}
                meta={meta}
                end={
                  <>
                    {q.lastStatus === 'unanswered' ? <Badge tone="warn">Onbeantwoord</Badge> : null}
                    <Button variant="ghost" size="sm" onClick={() => openDrilldown(q)}>
                      Gesprekken
                    </Button>
                    {inQA ? (
                      <Badge tone="ok">
                        <Check size={12} strokeWidth={2.4} aria-hidden="true" />
                        In Q&amp;A
                      </Badge>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDrafting({ question: q.question, answer: '' })}
                      >
                        Maak Q&amp;A
                      </Button>
                    )}
                  </>
                }
              />
            );
          })}
        </List>
      </section>

      {configCard}

      {drilldown ? (
        <Drawer title={drilldown.question} onClose={closeDrilldown}>
          {hits === null ? (
            <div className="v1-gs-convo" aria-busy="true" aria-label="Gesprekken laden">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={44} radius={12} />
              ))}
            </div>
          ) : hits.length === 0 ? (
            <EmptyState>Geen losse gesprekken gevonden voor deze vraag.</EmptyState>
          ) : (
            <section className="v1-card v1-gs-listcard" aria-label="Gesprekken met deze vraag">
              <List>
                {hits.map((h) => (
                  <li key={h.threadId}>
                    {/* Sluit dit paneel; het gesprek opent via de onderschepte route in zijn eigen paneel. */}
                    <Link
                      href={`/voorbeeld/gesprekken/${h.threadId}`}
                      scroll={false}
                      className="v1-list-row v1-list-row--link"
                      onClick={closeDrilldown}
                    >
                      <span className="v1-list-main">
                        <span className="v1-list-title v1-list-title--wrap">{h.snippet}</span>
                        <span className="v1-list-meta">{formatShort(h.askedAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </List>
            </section>
          )}
        </Drawer>
      ) : null}

      {drafting ? (
        <Drawer
          title="Toevoegen aan je Q&A"
          onClose={closeDraft}
          footer={
            <>
              <Button variant="ghost" onClick={closeDraft} disabled={saving}>
                Annuleren
              </Button>
              <Button
                onClick={save}
                loading={saving}
                disabled={!drafting.question.trim() || !drafting.answer.trim()}
              >
                Opslaan als Q&amp;A
              </Button>
            </>
          }
        >
          <p className="v1-hint">Bekijk wat je chatbot nu zegt en schrijf het antwoord dat hij voortaan geeft.</p>
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
