'use client';

// CheckInModal — create + edit voor wekelijkse check-ins.
// Volgt het MilestoneModal-patroon (inline-style glassmorphic, useState init
// via key-prop in parent).

import { useEffect, useState, useTransition } from 'react';
import type { CheckIn, CheckInInput } from '@/lib/commandcenter/types';
import {
  createCheckInAction,
  deleteCheckInAction,
  updateCheckInAction,
} from '@/app/actions/commandcenter';
import { Icon } from '@/app/components/svg-icons';

type Props = {
  open: boolean;
  checkIn: CheckIn | null;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  weekLabel: string;
  date: string;
  attendees: string; // comma-separated in UI
  completed: string;
  notCompleted: string;
  reasons: string;
  sebastiaanNextTasks: string; // newline-separated
  nielsNextTasks: string;
  sharedNextTasks: string;
  nextPriorities: string; // newline-separated (max 3 ideally)
  blockers: string;
  decisions: string;
};

function defaultWeekLabel(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now.getTime() - start.getTime()) / 86400000;
  const week = Math.ceil((diff + start.getDay() + 1) / 7);
  return `Week ${week} ${now.getFullYear()}`;
}

function emptyForm(): FormState {
  return {
    weekLabel: defaultWeekLabel(),
    date: new Date().toISOString().slice(0, 10),
    attendees: 'Sebastiaan, Niels',
    completed: '',
    notCompleted: '',
    reasons: '',
    sebastiaanNextTasks: '',
    nielsNextTasks: '',
    sharedNextTasks: '',
    nextPriorities: '',
    blockers: '',
    decisions: '',
  };
}

function ciToForm(c: CheckIn): FormState {
  return {
    weekLabel: c.weekLabel,
    date: c.date,
    attendees: c.attendees.join(', '),
    completed: c.completed,
    notCompleted: c.notCompleted,
    reasons: c.reasons,
    sebastiaanNextTasks: c.sebastiaanNextTasks.join('\n'),
    nielsNextTasks: c.nielsNextTasks.join('\n'),
    sharedNextTasks: c.sharedNextTasks.join('\n'),
    nextPriorities: c.nextPriorities.join('\n'),
    blockers: c.blockers,
    decisions: c.decisions,
  };
}

function splitLines(s: string): string[] {
  return s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

function formToInput(f: FormState): CheckInInput {
  return {
    weekLabel: f.weekLabel.trim(),
    date: f.date,
    attendees: f.attendees
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    completed: f.completed,
    notCompleted: f.notCompleted,
    reasons: f.reasons,
    sebastiaanNextTasks: splitLines(f.sebastiaanNextTasks),
    nielsNextTasks: splitLines(f.nielsNextTasks),
    sharedNextTasks: splitLines(f.sharedNextTasks),
    nextPriorities: splitLines(f.nextPriorities),
    blockers: f.blockers,
    decisions: f.decisions,
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

export function CheckInModal({ open, checkIn, onClose, onSaved }: Props) {
  const isEdit = !!checkIn;
  const [form, setForm] = useState<FormState>(checkIn ? ciToForm(checkIn) : emptyForm());
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

  function submit() {
    if (!form.weekLabel.trim()) {
      setError('Week-label is verplicht.');
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
        ? await updateCheckInAction(checkIn!.id, input)
        : await createCheckInAction(input);
      if (!res.ok) {
        setError(res.error || 'Opslaan mislukt.');
        return;
      }
      onSaved();
      onClose();
    });
  }

  function remove() {
    if (!checkIn) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteCheckInAction(checkIn.id);
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
      aria-label={isEdit ? 'Check-in bewerken' : 'Nieuwe check-in'}
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
          maxWidth: 760,
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
            {isEdit ? 'Check-in bewerken' : 'Nieuwe check-in'}
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
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Week-label*</label>
              <input
                type="text"
                value={form.weekLabel}
                onChange={(e) => set('weekLabel', e.target.value)}
                style={{ ...fieldStyle, marginTop: 6 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Datum*</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                style={{ ...fieldStyle, marginTop: 6 }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Aanwezigen (komma-gescheiden)</label>
            <input
              type="text"
              value={form.attendees}
              onChange={(e) => set('attendees', e.target.value)}
              placeholder="Sebastiaan, Niels"
              style={{ ...fieldStyle, marginTop: 6 }}
            />
          </div>

          <div>
            <label style={labelStyle}>Wat is afgerond?</label>
            <textarea
              value={form.completed}
              onChange={(e) => set('completed', e.target.value)}
              rows={3}
              style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Wat is niet gelukt?</label>
              <textarea
                value={form.notCompleted}
                onChange={(e) => set('notCompleted', e.target.value)}
                rows={3}
                style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Waarom niet?</label>
              <textarea
                value={form.reasons}
                onChange={(e) => set('reasons', e.target.value)}
                rows={3}
                style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>3 prioriteiten volgende week (één per regel)</label>
            <textarea
              value={form.nextPriorities}
              onChange={(e) => set('nextPriorities', e.target.value)}
              rows={3}
              placeholder={'Bijv.\nWidget pilot live krijgen\nDemo voor 2 testklanten'}
              style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Taken Sebastiaan (één per regel)</label>
              <textarea
                value={form.sebastiaanNextTasks}
                onChange={(e) => set('sebastiaanNextTasks', e.target.value)}
                rows={4}
                style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Taken Niels (één per regel)</label>
              <textarea
                value={form.nielsNextTasks}
                onChange={(e) => set('nielsNextTasks', e.target.value)}
                rows={4}
                style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Gezamenlijk (één per regel)</label>
              <textarea
                value={form.sharedNextTasks}
                onChange={(e) => set('sharedNextTasks', e.target.value)}
                rows={4}
                style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Geblokkeerde punten</label>
              <textarea
                value={form.blockers}
                onChange={(e) => set('blockers', e.target.value)}
                rows={3}
                style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Beslissingen genomen</label>
              <textarea
                value={form.decisions}
                onChange={(e) => set('decisions', e.target.value)}
                rows={3}
                style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
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
                {pending ? 'Opslaan…' : isEdit ? 'Opslaan' : 'Check-in aanmaken'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
