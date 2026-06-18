'use client';

import { useState, useTransition } from 'react';
import { MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  deleteQAItemAction,
  setQAActiveAction,
  upsertQAItemAction,
} from '../../actions';
import { CurrentBotAnswer } from './current-bot-answer';
import type { ManualQA } from '@/lib/v0/klantendashboard/types';

type DraftQA = Omit<ManualQA, 'id' | 'updatedAt'> & { id?: string };

function emptyDraft(): DraftQA {
  return { question: '', answer: '', category: '', active: true };
}

export function QATab({ initialQA }: { initialQA: ManualQA[] }) {
  const [items, setItems] = useState<ManualQA[]>(initialQA);
  const [editing, setEditing] = useState<DraftQA | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openNew() {
    setEditing(emptyDraft());
  }

  function openEdit(qa: ManualQA) {
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
    const now = new Date().toISOString();
    const item: ManualQA = {
      id: editing.id ?? `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question: editing.question,
      answer: editing.answer,
      category: editing.category || undefined,
      active: editing.active,
      updatedAt: now,
    };
    setError(null);
    startTransition(async () => {
      const res = await upsertQAItemAction(item);
      if (res.ok) {
        setItems(res.qa);
        setEditing(null);
      } else {
        setError(res.error);
      }
    });
  }

  function toggleActive(id: string) {
    const target = items.find((x) => x.id === id);
    if (!target) return;
    startTransition(async () => {
      const res = await setQAActiveAction(id, !target.active);
      if (res.ok) setItems(res.qa);
      else setError(res.error);
    });
  }

  function remove(id: string) {
    if (!confirm('Q&A verwijderen?')) return;
    startTransition(async () => {
      const res = await deleteQAItemAction(id);
      if (res.ok) setItems(res.qa);
      else setError(res.error);
    });
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 className="klant-section-title">Handmatige Q&amp;A</h3>
          <p className="klant-section-help">
            Hiermee herschrijf je het antwoord dat de AI op een vraag geeft. Je voegt geen
            losse feiten toe — je bepaalt precies wat je chatbot voortaan zegt. Handig voor
            onderwerpen waar je chatbot anders niet het juiste antwoord zou geven.
          </p>
        </div>
        <button type="button" onClick={openNew} className="klant-btn" data-variant="primary">
          <Plus size={14} strokeWidth={2} /> Nieuwe Q&amp;A
        </button>
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

      {items.length === 0 ? (
        <div className="klant-empty">
          <div className="klant-empty-icon">
            <MessageSquareText size={26} strokeWidth={1.6} />
          </div>
          <h3 className="klant-empty-title">Nog geen Q&amp;A</h3>
          <p className="klant-empty-sub">
            Maak je eerste vraag-en-antwoord aan voor onderwerpen die je chatbot vaak gaat krijgen
            — bijvoorbeeld openingstijden of contactopties.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="klant-btn"
            data-variant="primary"
            style={{ marginTop: 8 }}
          >
            <Plus size={14} strokeWidth={2} /> Eerste Q&amp;A toevoegen
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((qa) => (
            <article
              key={qa.id}
              className="klant-card"
              style={{
                opacity: qa.active ? 1 : 0.6,
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginBottom: 6,
                  }}
                >
                  {qa.category && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: 'var(--klant-surface)',
                        color: 'var(--klant-fg-muted)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {qa.category}
                    </span>
                  )}
                  {!qa.active && (
                    <span
                      className="klant-status"
                      data-tone="neutral"
                      style={{ fontSize: 11 }}
                    >
                      Inactief
                    </span>
                  )}
                </div>
                <h4
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--klant-fg)',
                    margin: '0 0 6px',
                    lineHeight: 1.4,
                  }}
                >
                  {qa.question}
                </h4>
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--klant-fg-muted)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {qa.answer}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => toggleActive(qa.id)}
                  className="klant-btn"
                  data-variant="ghost"
                  title={qa.active ? 'Inactief maken' : 'Activeren'}
                  style={{ padding: 6 }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 28,
                      height: 16,
                      borderRadius: 999,
                      background: qa.active ? 'var(--klant-accent)' : 'var(--klant-border-strong)',
                      position: 'relative',
                      transition: 'background 120ms ease',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: qa.active ? 14 : 2,
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: '#fff',
                        transition: 'left 120ms ease',
                      }}
                    />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(qa)}
                  className="klant-btn"
                  data-variant="ghost"
                  title="Bewerken"
                  style={{ padding: 6 }}
                >
                  <Pencil size={14} strokeWidth={1.7} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(qa.id)}
                  className="klant-btn"
                  data-variant="danger"
                  title="Verwijderen"
                  style={{ padding: 6 }}
                >
                  <Trash2 size={14} strokeWidth={1.7} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div
          onClick={() => setEditing(null)}
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
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                color: 'var(--klant-fg)',
              }}
            >
              {editing.id ? 'Q&A bewerken' : 'Nieuwe Q&A'}
            </h3>
            <div>
              <label className="klant-label">Vraag</label>
              <input
                className="klant-input"
                value={editing.question}
                onChange={(e) => setEditing({ ...editing, question: e.target.value })}
                placeholder="Bijv. Wat zijn jullie openingstijden?"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label className="klant-label">Antwoord dat je chatbot moet geven</label>
                <p className="klant-section-help" style={{ margin: '2px 0 0' }}>
                  Hier herschrijf je het antwoord dat de AI geeft. Bekijk eerst wat je chatbot
                  nu zegt en pas het aan waar nodig.
                </p>
              </div>
              <CurrentBotAnswer question={editing.question} />
              <textarea
                className="klant-textarea"
                value={editing.answer}
                onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
                placeholder="Schrijf hier het antwoord dat je chatbot voortaan moet geven."
                rows={4}
              />
            </div>
            <div>
              <label className="klant-label">Categorie (optioneel)</label>
              <input
                className="klant-input"
                value={editing.category ?? ''}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                placeholder="Bijv. Openingstijden, Prijzen, Contact"
              />
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--klant-fg)',
              }}
            >
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              Actief — je chatbot gebruikt dit antwoord
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button type="button" onClick={() => setEditing(null)} className="klant-btn">
                Annuleren
              </button>
              <button
                type="button"
                onClick={save}
                className="klant-btn"
                data-variant="primary"
                disabled={pending || !editing.question.trim() || !editing.answer.trim()}
              >
                {pending ? 'Bezig…' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
