'use client';

import { useState, useTransition } from 'react';
import { MessagesSquare, Plus, Check } from 'lucide-react';
import { addQAFromTopQuestionAction } from '../../actions';
import { StatusBadge } from '../../components/status-badge';
import type { TopQuestion } from '@/lib/v0/klantendashboard/server/top-questions';

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TopQuestionsTab({ initial }: { initial: TopQuestion[] }) {
  const [items] = useState<TopQuestion[]>(initial);
  const [drafting, setDrafting] = useState<{ question: string; answer: string } | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <div className="klant-empty">
        <div className="klant-empty-icon">
          <MessagesSquare size={26} strokeWidth={1.6} />
        </div>
        <h3 className="klant-empty-title">Nog geen vragen geteld</h3>
        <p className="klant-empty-sub">
          Zodra bezoekers vragen stellen aan je chatbot, verschijnt hier een ranglijst
          van de vragen die het vaakst terugkomen — handig om je FAQ uit te breiden.
        </p>
      </div>
    );
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

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <p
          className="klant-section-help"
          style={{ margin: 0, maxWidth: 640 }}
        >
          De vragen die je bezoekers het vaakst stellen — gebaseerd op de laatste 500
          gesprekken. Klik op &quot;Maak Q&amp;A&quot; om een goed antwoord vast te leggen,
          dan beantwoordt je chatbot deze vraag voortaan direct uit je kennisbank.
        </p>
        <div style={{ fontSize: 12, color: 'var(--klant-fg-dim)' }}>
          Top {items.length} · vandaag bijgewerkt
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
        <table className="klant-table">
          <thead>
            <tr>
              <th>Vraag</th>
              <th style={{ width: 110 }}>Aantal</th>
              <th style={{ width: 140 }}>Laatste status</th>
              <th style={{ width: 160 }}>Laatst gesteld</th>
              <th style={{ width: 150, textAlign: 'right' }}>Actie</th>
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
              <p
                className="klant-section-help"
                style={{ margin: '4px 0 0' }}
              >
                Schrijf het antwoord dat je chatbot moet geven. Vanaf dat moment beantwoordt
                hij vergelijkbare vragen meteen — geen retrieval nodig.
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
            <div>
              <label className="klant-label">Antwoord</label>
              <textarea
                className="klant-textarea"
                value={drafting.answer}
                onChange={(e) => setDrafting({ ...drafting, answer: e.target.value })}
                placeholder="Schrijf hier het antwoord dat je chatbot moet geven."
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
