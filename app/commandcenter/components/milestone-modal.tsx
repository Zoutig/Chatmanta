'use client';

// MilestoneModal — create + edit. Spiegelt het TaskModal-patroon (inline-style
// glassmorphic panel + useState initializer via key-prop).

import { useEffect, useState, useTransition } from 'react';
import {
  MILESTONE_DEFAULTS,
  MILESTONE_STATUSES,
  OWNERS,
  ROADMAP_PHASES,
  type Milestone,
  type MilestoneInput,
  type MilestoneStatus,
  type Owner,
  type RoadmapPhase,
  type Task,
} from '@/lib/commandcenter/types';
import {
  createMilestoneAction,
  deleteMilestoneAction,
  updateMilestoneAction,
} from '@/app/actions/commandcenter';
import { Icon } from '@/app/components/svg-icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';

type Props = {
  open: boolean;
  milestone: Milestone | null;
  /** Subset van taken die voor linked-tasks geselecteerd kunnen worden.
   *  In de huidige UI passen we deze al gefilterd op de fase aan zodat de
   *  lijst behapbaar blijft. */
  candidateTasks: Task[];
  defaultPhase?: RoadmapPhase;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  title: string;
  description: string;
  roadmapPhase: RoadmapPhase;
  owner: Owner;
  status: MilestoneStatus;
  deadline: string;
  acceptanceCriteria: string; // newline-gescheiden in textarea
  linkedTaskIds: string[];
};

function emptyForm(defaultPhase?: RoadmapPhase): FormState {
  return {
    title: '',
    description: '',
    roadmapPhase: defaultPhase ?? MILESTONE_DEFAULTS.roadmapPhase,
    owner: MILESTONE_DEFAULTS.owner,
    status: MILESTONE_DEFAULTS.status,
    deadline: '',
    acceptanceCriteria: '',
    linkedTaskIds: [],
  };
}

function msToForm(m: Milestone): FormState {
  return {
    title: m.title,
    description: m.description ?? '',
    roadmapPhase: m.roadmapPhase,
    owner: m.owner,
    status: m.status,
    deadline: m.deadline ?? '',
    acceptanceCriteria: m.acceptanceCriteria.join('\n'),
    linkedTaskIds: m.linkedTaskIds,
  };
}

function formToInput(f: FormState): MilestoneInput {
  return {
    title: f.title.trim(),
    description: f.description.trim() || null,
    roadmapPhase: f.roadmapPhase,
    owner: f.owner,
    status: f.status,
    deadline: f.deadline || null,
    acceptanceCriteria: f.acceptanceCriteria
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    linkedTaskIds: f.linkedTaskIds,
  };
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--fg-muted)',
  fontWeight: 500,
};
const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 10,
  padding: '8px 12px',
  color: 'var(--fg)',
  fontSize: 14,
  outline: 'none',
};

export function MilestoneModal({
  open,
  milestone,
  candidateTasks,
  defaultPhase,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!milestone;
  const [form, setForm] = useState<FormState>(
    milestone ? msToForm(milestone) : emptyForm(defaultPhase),
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

  function toggleLinkedTask(id: string) {
    setForm((prev) => {
      const has = prev.linkedTaskIds.includes(id);
      return {
        ...prev,
        linkedTaskIds: has
          ? prev.linkedTaskIds.filter((x) => x !== id)
          : [...prev.linkedTaskIds, id],
      };
    });
  }

  function submit() {
    if (!form.title.trim()) {
      setError('Titel is verplicht.');
      return;
    }
    setError(null);
    const input = formToInput(form);
    startTransition(async () => {
      const res = isEdit
        ? await updateMilestoneAction(milestone!.id, input)
        : await createMilestoneAction(input);
      if (!res.ok) {
        setError(res.error || 'Opslaan mislukt.');
        return;
      }
      onSaved();
      onClose();
    });
  }

  function remove() {
    if (!milestone) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteMilestoneAction(milestone.id);
      if (!res.ok) {
        setError(res.error || 'Verwijderen mislukt.');
        return;
      }
      onSaved();
      onClose();
    });
  }

  const phaseTasks = candidateTasks.filter((t) => t.roadmapPhase === form.roadmapPhase);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Milestone bewerken' : 'Nieuwe milestone'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0, 0, 0, 0.55)',
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
          maxWidth: 720,
          background: 'var(--bg-elev)',
          border: '1px solid var(--border-strong)',
          borderRadius: 20,
          boxShadow:
            '0 24px 80px -24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
          padding: 24,
          color: 'var(--fg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--fg)' }}>
            {isEdit ? 'Milestone bewerken' : 'Nieuwe milestone'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluit"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-strong)',
              borderRadius: 999,
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--fg-muted)',
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
              placeholder="Wat is het concrete eindpunt?"
              style={{ ...fieldStyle, marginTop: 6 }}
              maxLength={200}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Roadmapfase</label>
              <div style={{ marginTop: 6 }}>
                <Select value={form.roadmapPhase} onValueChange={(v) => set('roadmapPhase', v as RoadmapPhase)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROADMAP_PHASES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <div style={{ marginTop: 6 }}>
                <Select value={form.status} onValueChange={(v) => set('status', v as MilestoneStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MILESTONE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Eigenaar</label>
              <div style={{ marginTop: 6 }}>
                <Select value={form.owner} onValueChange={(v) => set('owner', v as Owner)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OWNERS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Deadline</label>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => set('deadline', e.target.value)}
                style={{ ...fieldStyle, marginTop: 6 }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Beschrijving</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Acceptatiecriteria (één per regel)</label>
            <textarea
              value={form.acceptanceCriteria}
              onChange={(e) => set('acceptanceCriteria', e.target.value)}
              rows={4}
              placeholder={'Bijv.\np50 < 4s\nHallucination-rate < 2%'}
              style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
            />
          </div>

          {phaseTasks.length > 0 && (
            <div>
              <label style={labelStyle}>
                Gekoppelde taken ({form.linkedTaskIds.length} geselecteerd) — toon taken in {form.roadmapPhase}
              </label>
              <div
                style={{
                  marginTop: 6,
                  maxHeight: 180,
                  overflowY: 'auto',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {phaseTasks.map((t) => {
                  const checked = form.linkedTaskIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 6px',
                        fontSize: 13,
                        cursor: 'pointer',
                        borderRadius: 6,
                        background: checked ? 'var(--surface-3)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLinkedTask(t.id)}
                      />
                      <span style={{ flex: 1, color: 'var(--fg)' }}>{t.title}</span>
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--fg-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {t.owner}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p
              style={{
                fontSize: 13,
                color: 'var(--err)',
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
                  color: 'var(--err)',
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
                  border: '1px solid var(--border-strong)',
                  color: 'var(--fg-muted)',
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
                  background: 'var(--manta-accent, var(--accent))',
                  border: '1px solid color-mix(in oklab, var(--manta-accent, var(--accent)) 50%, transparent)',
                  color: 'var(--accent-fg)',
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: pending ? 'not-allowed' : 'pointer',
                }}
              >
                {pending ? 'Opslaan…' : isEdit ? 'Opslaan' : 'Milestone aanmaken'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
