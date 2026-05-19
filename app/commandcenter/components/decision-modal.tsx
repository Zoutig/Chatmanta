'use client';

// DecisionModal — create + edit voor beslissingenlog (goal-prompt §13).

import { useEffect, useState, useTransition } from 'react';
import {
  DECISION_DEFAULTS,
  DECISION_STATUSES,
  IMPACTS,
  OWNERS,
  type Decision,
  type DecisionInput,
  type DecisionStatus,
  type Impact,
  type Owner,
} from '@/lib/commandcenter/types';
import {
  createDecisionAction,
  deleteDecisionAction,
  updateDecisionAction,
} from '@/app/actions/commandcenter';
import { Icon } from '@/app/components/svg-icons';

type Props = {
  open: boolean;
  decision: Decision | null;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  date: string;
  title: string;
  decision: string;
  context: string;
  impact: '' | Impact;
  decidedBy: Owner[];
  reviewDate: string;
  status: DecisionStatus;
};

function emptyForm(): FormState {
  return {
    date: new Date().toISOString().slice(0, 10),
    title: '',
    decision: '',
    context: '',
    impact: '',
    decidedBy: DECISION_DEFAULTS.decidedBy.slice(),
    reviewDate: '',
    status: DECISION_DEFAULTS.status,
  };
}

function decToForm(d: Decision): FormState {
  return {
    date: d.date,
    title: d.title,
    decision: d.decision,
    context: d.context ?? '',
    impact: d.impact ?? '',
    decidedBy: d.decidedBy.slice(),
    reviewDate: d.reviewDate ?? '',
    status: d.status,
  };
}

function formToInput(f: FormState): DecisionInput {
  return {
    date: f.date,
    title: f.title.trim(),
    decision: f.decision,
    context: f.context.trim() || null,
    impact: f.impact || null,
    decidedBy: f.decidedBy,
    reviewDate: f.reviewDate || null,
    status: f.status,
  };
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'rgba(207,232,240,0.55)',
  fontWeight: 500,
};
const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(120,200,230,0.16)',
  borderRadius: 10,
  padding: '8px 12px',
  color: '#eaf6fb',
  fontSize: 14,
  outline: 'none',
};

export function DecisionModal({ open, decision, onClose, onSaved }: Props) {
  const isEdit = !!decision;
  const [form, setForm] = useState<FormState>(
    decision ? decToForm(decision) : emptyForm(),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleOwner(o: Owner) {
    setForm((prev) => {
      const has = prev.decidedBy.includes(o);
      return {
        ...prev,
        decidedBy: has
          ? prev.decidedBy.filter((x) => x !== o)
          : [...prev.decidedBy, o],
      };
    });
  }

  function submit() {
    if (!form.title.trim()) {
      setError('Titel is verplicht.');
      return;
    }
    if (!form.date) {
      setError('Datum is verplicht.');
      return;
    }
    setError(null);
    const input = formToInput(form);
    startTransition(async () => {
      const res = isEdit
        ? await updateDecisionAction(decision!.id, input)
        : await createDecisionAction(input);
      if (!res.ok) {
        setError(res.error || 'Opslaan mislukt.');
        return;
      }
      onSaved();
      onClose();
    });
  }

  function remove() {
    if (!decision) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteDecisionAction(decision.id);
      if (!res.ok) {
        setError(res.error || 'Verwijderen mislukt.');
        return;
      }
      onSaved();
      onClose();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Beslissing bewerken' : 'Nieuwe beslissing'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(2, 6, 12, 0.74)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '6vh 16px',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          background:
            'linear-gradient(180deg, rgba(20,32,42,0.94), rgba(10,18,26,0.94))',
          border: '1px solid rgba(120,200,230,0.18)',
          borderRadius: 20,
          boxShadow:
            '0 24px 80px -24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
          padding: 24,
          color: '#eaf6fb',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {isEdit ? 'Beslissing bewerken' : 'Nieuwe beslissing'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluit"
            style={{
              background: 'transparent',
              border: '1px solid rgba(120,200,230,0.18)',
              borderRadius: 999,
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(207,232,240,0.7)',
              cursor: 'pointer',
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={labelStyle}>Titel*</label>
            <input
              type="text"
              autoFocus
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Korte naam van de beslissing"
              style={{ ...fieldStyle, marginTop: 6 }}
              maxLength={200}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Datum*</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                style={{ ...fieldStyle, marginTop: 6 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value as DecisionStatus)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                {DECISION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Impact</label>
              <select
                value={form.impact}
                onChange={(e) => set('impact', e.target.value as '' | Impact)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                <option value="">— niet gespecificeerd —</option>
                {IMPACTS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Beslissing</label>
            <textarea
              value={form.decision}
              onChange={(e) => set('decision', e.target.value)}
              rows={3}
              placeholder="Wat is er besloten?"
              style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Context / waarom</label>
            <textarea
              value={form.context}
              onChange={(e) => set('context', e.target.value)}
              rows={3}
              placeholder="Waarom deze keuze? Welke overwegingen speelden mee?"
              style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Besloten door</label>
              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {OWNERS.map((o) => {
                  const active = form.decidedBy.includes(o);
                  return (
                    <button
                      type="button"
                      key={o}
                      onClick={() => toggleOwner(o)}
                      style={{
                        background: active
                          ? 'color-mix(in oklab, var(--manta-accent) 18%, transparent)'
                          : 'transparent',
                        border: active
                          ? '1px solid color-mix(in oklab, var(--manta-accent) 36%, transparent)'
                          : '1px solid rgba(120,200,230,0.16)',
                        color: active ? '#eaf6fb' : 'rgba(207,232,240,0.7)',
                        borderRadius: 999,
                        padding: '5px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Herzien op</label>
              <input
                type="date"
                value={form.reviewDate}
                onChange={(e) => set('reviewDate', e.target.value)}
                style={{ ...fieldStyle, marginTop: 6 }}
              />
            </div>
          </div>

          {error && (
            <p
              style={{
                fontSize: 13,
                color: '#f1a5a5',
                margin: 0,
                background: 'rgba(220,90,90,0.10)',
                border: '1px solid rgba(220,90,90,0.30)',
                padding: '8px 12px',
                borderRadius: 10,
              }}
            >
              {error}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 6,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            {isEdit ? (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                style={{
                  background: confirmDelete ? 'rgba(220,90,90,0.18)' : 'transparent',
                  border: '1px solid rgba(220,90,90,0.34)',
                  color: '#f1a5a5',
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: pending ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Icon name="trash" size={14} />
                {confirmDelete ? 'Klik opnieuw om te bevestigen' : 'Verwijderen'}
              </button>
            ) : (
              <span />
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(120,200,230,0.18)',
                  color: 'rgba(207,232,240,0.7)',
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: pending ? 'not-allowed' : 'pointer',
                }}
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                style={{
                  background: 'var(--manta-accent)',
                  border:
                    '1px solid color-mix(in oklab, var(--manta-accent) 50%, transparent)',
                  color: '#03171a',
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: pending ? 'not-allowed' : 'pointer',
                }}
              >
                {pending ? 'Opslaan…' : isEdit ? 'Opslaan' : 'Beslissing vastleggen'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
