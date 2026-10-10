'use client';

// V0 Klantendashboard — "Meest gestelde vragen"-tab (M5).
//
// Leest sinds M5 de periodieke FAQ-snapshot (KlantFaqRow[]): semantisch
// geclusterde vragen met count, status, last-asked en de cluster-varianten
// (memberQuestions) achter de representatieve vraag. Drie taken in één scherm:
//   1. de drempel/lijst-config (verhuisd uit Instellingen, item 6)
//   2. de klikbare ranglijst met "+N andere formuleringen"-hint
//   3. een drilldown-modal naar de gesprekken waarin een vraag is gesteld
// De "Maak Q&A"-flow (draft-modal → addQAFromTopQuestionAction) blijft intact.

import { useEffect, useRef, useState, useTransition } from 'react';
import { MessagesSquare, Plus, Check, MessageSquare, X, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  addQAFromTopQuestionAction,
  getConversationsForQuestionAction,
  type QuestionConversationHit,
} from '../../actions';
import { StatusBadge } from '../../components/status-badge';
import { CurrentBotAnswer } from '../../kennisbank/components/current-bot-answer';
import { TopQuestionsConfigCard } from './top-questions-config-card';
import type { KlantFaqRow } from '@/lib/v0/klantendashboard/server/top-questions';
import type { TopQuestionsConfig } from '@/lib/v0/klantendashboard/types';

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TopQuestionsTab({
  initial,
  existingQAQuestions = [],
  config,
  totalUnique,
  pending: snapshotPending,
  generatedAt,
}: {
  initial: KlantFaqRow[];
  /** Vragen die al als actieve Q&A in v0_org_settings.qa staan — initial seed
   * voor de "✓ In Q&A"-badge zodat die na page-reload zichtbaar blijft. */
  existingQAQuestions?: string[];
  /** Drempel + lijst-grootte uit v0_org_settings.top_questions. */
  config: TopQuestionsConfig;
  /** Aantal unieke vragen vóór filtering. Onderscheidt "echt geen vragen"
   * (=0) van "geen vragen die de drempel halen" (>0 maar initial leeg). */
  totalUnique: number;
  /** True zolang de cron nog geen snapshot heeft geproduceerd. */
  pending: boolean;
  /** Wanneer de snapshot is berekend (null bij pending). */
  generatedAt: string | null;
}) {
  const [items] = useState<KlantFaqRow[]>(initial);
  const [drafting, setDrafting] = useState<{ question: string; answer: string } | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(
    () => new Set(existingQAQuestions.map((q) => q.trim().toLowerCase())),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Drilldown-state: welke vraag bekijken we, en de geladen gesprekken.
  const [drilldown, setDrilldown] = useState<KlantFaqRow | null>(null);
  const [hits, setHits] = useState<QuestionConversationHit[] | null>(null);
  const [drilldownPending, startDrilldown] = useTransition();
  // Volgnummer om een trager binnenkomend antwoord van een vorige klik te negeren
  // (race bij snel achter elkaar twee vragen openen — Codex M5 #4).
  const drilldownReqRef = useRef(0);

  // Escape sluit de drilldown-modal (a11y). Listener alleen actief zolang open.
  useEffect(() => {
    if (!drilldown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrilldown(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drilldown]);

  function openDrilldown(row: KlantFaqRow) {
    const reqId = ++drilldownReqRef.current;
    setDrilldown(row);
    setHits(null);
    startDrilldown(async () => {
      const res = await getConversationsForQuestionAction(row.memberQuestions);
      // Negeer een trager binnenkomend antwoord van een eerdere klik.
      if (drilldownReqRef.current !== reqId) return;
      setHits(res.ok ? res.hits : []);
    });
  }

  function save() {
    if (!drafting) return;
    if (!drafting.question.trim() || !drafting.answer.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addQAFromTopQuestionAction(drafting.question, drafting.answer);
      if (res.ok) {
        setSavedKeys((prev) => new Set(prev).add(drafting.question.toLowerCase()));
        setDrafting(null);
      } else {
        setError(res.error);
      }
    });
  }

  // De config-card staat bovenaan de tab (verhuisd uit Instellingen, item 6).
  // Hij wordt altijd getoond — ook in de lege/pending-staten, zodat de klant de
  // drempel kan verlagen zónder eerst vragen te hoeven hebben.
  const configCard = <TopQuestionsConfigCard initial={config} />;

  // ---- Lege / pending staten -------------------------------------------------
  if (snapshotPending) {
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {configCard}
        <div className="klant-empty">
          <div className="klant-empty-icon">
            <MessagesSquare size={26} strokeWidth={1.6} />
          </div>
          <h3 className="klant-empty-title">De ranglijst wordt nog opgebouwd</h3>
          <p className="klant-empty-sub">
            De ranglijst wordt periodiek automatisch bijgewerkt — kom binnenkort terug.
          </p>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    const hasRawQuestions = totalUnique > 0;
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {configCard}
        <div className="klant-empty">
          <div className="klant-empty-icon">
            <MessagesSquare size={26} strokeWidth={1.6} />
          </div>
          <h3 className="klant-empty-title">
            {hasRawQuestions
              ? `Nog geen vragen met minimaal ${config.minCount}× herhaling`
              : 'Nog geen vragen geteld'}
          </h3>
          <p className="klant-empty-sub">
            {hasRawQuestions
              ? `Er zijn ${totalUnique} unieke vragen gesteld, maar nog geen die de drempel haalt. Verlaag de drempel hierboven of wacht tot bezoekers vaker dezelfde vraag stellen.`
              : 'Zodra bezoekers vragen stellen aan je chatbot, verschijnt hier een ranglijst van de vragen die het vaakst terugkomen — handig om je FAQ uit te breiden.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {configCard}

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <p className="klant-section-help" style={{ margin: 0, maxWidth: 640 }}>
          Vragen die ≥{config.minCount}× zijn gesteld — slim gegroepeerd op
          betekenis, zodat verschillende formuleringen van dezelfde vraag
          samentellen. Klik op &quot;Maak Q&amp;A&quot; om een goed antwoord vast te leggen,
          dan beantwoordt je chatbot deze vraag voortaan direct uit je kennisbank.
        </p>
        <div style={{ fontSize: 12, color: 'var(--klant-fg-dim)' }}>
          Top {items.length} van max {config.topN}
          {generatedAt ? ` · bijgewerkt ${formatDate(generatedAt)}` : ''}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--klant-r-sm)',
            background: 'var(--klant-danger-soft)',
            color: 'var(--klant-danger)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll">
        <table className="klant-table">
          <thead>
            <tr>
              <th>Vraag</th>
              <th style={{ width: 110 }}>Aantal</th>
              <th style={{ width: 140 }}>Laatste status</th>
              <th style={{ width: 160 }}>Laatst gesteld</th>
              <th style={{ width: 220, textAlign: 'right' }}>Actie</th>
            </tr>
          </thead>
          <tbody>
            {items.map((q) => {
              const key = q.question.toLowerCase();
              const inQA = savedKeys.has(key);
              return (
                <tr key={key}>
                  <td>
                    <span style={{ color: 'var(--klant-fg)', fontWeight: 500 }}>
                      {q.question}
                    </span>
                    {q.paraphraseCount > 0 && (
                      <span
                        style={{
                          display: 'block',
                          marginTop: 3,
                          fontSize: 11.5,
                          color: 'var(--klant-fg-dim)',
                        }}
                      >
                        +{q.paraphraseCount} andere formulering
                        {q.paraphraseCount === 1 ? '' : 'en'}
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--klant-fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {q.count}× gesteld
                  </td>
                  <td>
                    <StatusBadge
                      status={q.lastStatus === 'unanswered' ? 'unanswered' : 'answered'}
                      kind="conversation"
                    />
                  </td>
                  <td style={{ color: 'var(--klant-fg-muted)' }}>{formatDate(q.lastAskedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        justifyContent: 'flex-end',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openDrilldown(q)}
                        className="klant-btn"
                        data-variant="ghost"
                        style={{ fontSize: 12 }}
                        title="Bekijk de gesprekken waarin deze vraag is gesteld"
                      >
                        <MessageSquare size={12} strokeWidth={2} /> Bekijk gesprekken
                      </button>
                      {inQA ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: 'var(--klant-success)',
                            fontSize: 12,
                          }}
                        >
                          <Check size={13} /> In Q&amp;A
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDrafting({ question: q.question, answer: '' })}
                          className="klant-btn"
                          data-variant="ghost"
                          style={{ fontSize: 12 }}
                        >
                          <Plus size={12} strokeWidth={2} /> Maak Q&amp;A
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Drilldown-modal: gesprekken waarin de geselecteerde vraag is gesteld. */}
      {drilldown && (
        <div
          onClick={() => setDrilldown(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Gesprekken: ${drilldown.question}`}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <style>{`@keyframes klant-faq-spin { to { transform: rotate(360deg); } }`}</style>
          <div
            onClick={(e) => e.stopPropagation()}
            className="klant-card"
            style={{
              background: 'var(--klant-bg-elev, #fff)',
              color: 'var(--klant-fg)',
              borderRadius: 'var(--klant-r-lg, 12px)',
              maxWidth: 640,
              width: '100%',
              maxHeight: '82vh',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 16px',
                borderBottom: '1px solid var(--klant-border)',
              }}
            >
              <MessageSquare
                size={15}
                strokeWidth={1.8}
                style={{ flexShrink: 0, color: 'var(--klant-fg-muted)' }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--klant-fg)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={drilldown.question}
              >
                {drilldown.question}
              </span>
              <button
                type="button"
                onClick={() => setDrilldown(null)}
                aria-label="Sluiten"
                className="klant-btn"
                data-variant="ghost"
                style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}
              >
                <X size={16} />
              </button>
            </div>

            {drilldownPending || hits === null ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: 40,
                  color: 'var(--klant-fg-muted)',
                  fontSize: 13,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: '2px solid var(--klant-border)',
                    borderTopColor: 'var(--klant-accent)',
                    display: 'inline-block',
                    animation: 'klant-faq-spin 0.7s linear infinite',
                  }}
                />
                Gesprekken laden…
              </div>
            ) : hits.length === 0 ? (
              <div
                style={{
                  padding: '28px 20px',
                  fontSize: 13,
                  color: 'var(--klant-fg-muted)',
                  lineHeight: 1.5,
                }}
              >
                Geen losse gesprekken gevonden voor deze vraag.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'auto' }}>
                {hits.map((h, i) => (
                  <li
                    key={h.threadId}
                    style={{ borderTop: i ? '1px solid var(--klant-border)' : 'none' }}
                  >
                    <Link
                      href={`/klantendashboard/gesprekken/${h.threadId}`}
                      className="klant-convo-row"
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '12px 16px',
                        textDecoration: 'none',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: 'var(--klant-fg)',
                            lineHeight: 1.4,
                          }}
                        >
                          {h.snippet}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 11,
                            color: 'var(--klant-dim)',
                            fontFamily: 'var(--klant-font-mono)',
                          }}
                        >
                          {formatDate(h.askedAt)}
                        </div>
                      </div>
                      <ExternalLink
                        size={13}
                        strokeWidth={1.8}
                        style={{ flexShrink: 0, color: 'var(--klant-fg-dim)', marginTop: 2 }}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Maak-Q&A draft-modal (ongewijzigd t.o.v. M4). */}
      {drafting && (
        <div
          onClick={() => setDrafting(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 100,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="klant-card"
            style={{
              width: '100%',
              maxWidth: 560,
              background: 'var(--klant-bg-elev)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 600,
                  fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                  color: 'var(--klant-fg)',
                }}
              >
                Voeg deze vraag toe aan je Q&amp;A
              </h3>
              <p className="klant-section-help" style={{ margin: '4px 0 0' }}>
                Hier herschrijf je het antwoord dat de AI geeft. Bekijk eerst wat je chatbot
                nu zegt en pas het aan waar nodig — vanaf dat moment beantwoordt hij
                vergelijkbare vragen meteen met jouw tekst, geen retrieval nodig.
              </p>
            </div>
            <div>
              <label className="klant-label">Vraag</label>
              <input
                className="klant-input"
                value={drafting.question}
                onChange={(e) => setDrafting({ ...drafting, question: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="klant-label">Antwoord dat je chatbot moet geven</label>
              <CurrentBotAnswer question={drafting.question} />
              <textarea
                className="klant-textarea"
                value={drafting.answer}
                onChange={(e) => setDrafting({ ...drafting, answer: e.target.value })}
                placeholder="Schrijf hier het antwoord dat je chatbot voortaan moet geven."
                rows={4}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setDrafting(null)} className="klant-btn">
                Annuleren
              </button>
              <button
                type="button"
                onClick={save}
                className="klant-btn"
                data-variant="primary"
                disabled={pending || !drafting.question.trim() || !drafting.answer.trim()}
              >
                {pending ? 'Bezig…' : 'Opslaan als Q&A'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
