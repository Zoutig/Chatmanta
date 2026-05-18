'use client';

// TaskModal — create + edit form. Inline-style omdat Tailwind v4 PostCSS soms
// nieuwe utility-properties silent dropt (zie AGENTS.md). Glassmorphic panel
// past bij de rest van de UI.

import { useEffect, useState, useTransition } from 'react';
import {
  EFFORTS,
  IMPACTS,
  OWNERS,
  PRIORITIES,
  PRIORITY_LABELS,
  PROJECT_AREAS,
  ROADMAP_PHASES,
  TASK_DEFAULTS,
  TASK_STATUSES,
  type Effort,
  type Impact,
  type Owner,
  type Priority,
  type ProjectArea,
  type RoadmapPhase,
  type Task,
  type TaskInput,
  type TaskStatus,
} from '@/lib/commandcenter/types';
import {
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from '@/app/actions/commandcenter';
import { Icon } from '@/app/components/svg-icons';

type Props = {
  open: boolean;
  task: Task | null; // null = create-mode
  onClose: () => void;
  onSaved: () => void; // called after successful save/delete
};

type FormState = {
  title: string;
  description: string;
  projectArea: ProjectArea;
  roadmapPhase: RoadmapPhase;
  owner: Owner;
  status: TaskStatus;
  priority: Priority;
  deadline: string; // YYYY-MM-DD or ''
  impact: Impact;
  effort: Effort;
  blockerReason: string;
  nextAction: string;
  labels: string; // comma-separated for input simplicity
};

function emptyForm(): FormState {
  return {
    title: '',
    description: '',
    projectArea: TASK_DEFAULTS.projectArea,
    roadmapPhase: TASK_DEFAULTS.roadmapPhase,
    owner: TASK_DEFAULTS.owner,
    status: TASK_DEFAULTS.status,
    priority: TASK_DEFAULTS.priority,
    deadline: '',
    impact: TASK_DEFAULTS.impact,
    effort: TASK_DEFAULTS.effort,
    blockerReason: '',
    nextAction: '',
    labels: '',
  };
}

function taskToForm(t: Task): FormState {
  return {
    title: t.title,
    description: t.description ?? '',
    projectArea: t.projectArea,
    roadmapPhase: t.roadmapPhase,
    owner: t.owner,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline ?? '',
    impact: t.impact,
    effort: t.effort,
    blockerReason: t.blockerReason ?? '',
    nextAction: t.nextAction ?? '',
    labels: t.labels.join(', '),
  };
}

function formToInput(f: FormState): TaskInput {
  return {
    title: f.title.trim(),
    description: f.description.trim() || null,
    projectArea: f.projectArea,
    roadmapPhase: f.roadmapPhase,
    owner: f.owner,
    status: f.status,
    priority: f.priority,
    deadline: f.deadline || null,
    impact: f.impact,
    effort: f.effort,
    blockerReason: f.blockerReason.trim() || null,
    nextAction: f.nextAction.trim() || null,
    labels: f.labels
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
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

export function TaskModal({ open, task, onClose, onSaved }: Props) {
  const isEdit = !!task;
  // Parent supplies a `key` op (task?.id ?? 'new') zodat dit component remount
  // bij task-wissel — useState initializer pakt dan de juiste form-data.
  const [form, setForm] = useState<FormState>(task ? taskToForm(task) : emptyForm());
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
    if (!form.title.trim()) {
      setError('Titel is verplicht.');
      return;
    }
    setError(null);
    const input = formToInput(form);
    startTransition(async () => {
      const res = isEdit
        ? await updateTaskAction(task!.id, input)
        : await createTaskAction(input);
      if (!res.ok) {
        setError(res.error || 'Opslaan mislukt.');
        return;
      }
      onSaved();
      onClose();
    });
  }

  function remove() {
    if (!task) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteTaskAction(task.id);
      if (!res.ok) {
        setError(res.error || 'Verwijderen mislukt.');
        return;
      }
      onSaved();
      onClose();
    });
  }

  const showBlocker = form.status === 'Geblokkeerd';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Taak bewerken' : 'Nieuwe taak'}
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
          maxWidth: 720,
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2
            style={{
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {isEdit ? 'Taak bewerken' : 'Nieuwe taak'}
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
              placeholder="Wat moet er gebeuren?"
              style={{ ...fieldStyle, marginTop: 6 }}
              maxLength={200}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Eigenaar</label>
              <select
                value={form.owner}
                onChange={(e) => set('owner', e.target.value as Owner)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                {OWNERS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value as TaskStatus)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Prioriteit</label>
              <select
                value={form.priority}
                onChange={(e) => set('priority', e.target.value as Priority)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Projectgebied</label>
              <select
                value={form.projectArea}
                onChange={(e) => set('projectArea', e.target.value as ProjectArea)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                {PROJECT_AREAS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Roadmapfase</label>
              <select
                value={form.roadmapPhase}
                onChange={(e) => set('roadmapPhase', e.target.value as RoadmapPhase)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                {ROADMAP_PHASES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Impact</label>
              <select
                value={form.impact}
                onChange={(e) => set('impact', e.target.value as Impact)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                {IMPACTS.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Moeite</label>
              <select
                value={form.effort}
                onChange={(e) => set('effort', e.target.value as Effort)}
                style={{ ...fieldStyle, marginTop: 6 }}
              >
                {EFFORTS.map((e2) => (
                  <option key={e2} value={e2}>{e2}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Volgende actie</label>
            <input
              type="text"
              value={form.nextAction}
              onChange={(e) => set('nextAction', e.target.value)}
              placeholder="Wat is de eerstvolgende concrete stap?"
              style={{ ...fieldStyle, marginTop: 6 }}
            />
          </div>

          <div>
            <label style={labelStyle}>Beschrijving</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              style={{ ...fieldStyle, marginTop: 6, resize: 'vertical', minHeight: 72 }}
            />
          </div>

          <div>
            <label style={labelStyle}>Labels (komma-gescheiden)</label>
            <input
              type="text"
              value={form.labels}
              onChange={(e) => set('labels', e.target.value)}
              placeholder="bug, ux, decision-needed"
              style={{ ...fieldStyle, marginTop: 6 }}
            />
          </div>

          {showBlocker && (
            <div>
              <label style={labelStyle}>Blokkade reden</label>
              <textarea
                value={form.blockerReason}
                onChange={(e) => set('blockerReason', e.target.value)}
                rows={2}
                placeholder="Waarom zit deze taak vast?"
                style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }}
              />
            </div>
          )}

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
                  background: confirmDelete
                    ? 'rgba(220,90,90,0.18)'
                    : 'transparent',
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
                  border: '1px solid color-mix(in oklab, var(--manta-accent) 50%, transparent)',
                  color: '#03171a',
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: pending ? 'not-allowed' : 'pointer',
                }}
              >
                {pending ? 'Opslaan…' : isEdit ? 'Opslaan' : 'Taak aanmaken'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
