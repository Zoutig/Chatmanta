'use client';

// RoadmapClient — per-fase kaarten met progress, status, milestones en
// gekoppelde taken. Eén kaart per RoadmapPhase. Status-wissel persisteert
// via setPhaseStatusAction.

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  computePhaseProgress,
  type Milestone,
  type RoadmapPhase,
  type Task,
} from '@/lib/commandcenter/types';
import {
  PHASE_INFO,
  PHASE_STATUSES,
  type PhaseStatus,
} from '@/lib/commandcenter/roadmap-phases';
import { setPhaseStatusAction } from '@/app/actions/commandcenter';
import { Icon } from '@/app/components/svg-icons';
import {
  MilestoneStatusBadge,
  OwnerBadge,
  PhaseStatusBadge,
  PriorityBadge,
  ProgressBar,
  StatusBadge,
} from './badges';
import { MilestoneModal } from './milestone-modal';

type Props = {
  tasks: Task[];
  milestones: Milestone[];
  phaseStatuses: Record<RoadmapPhase, PhaseStatus>;
};

export function RoadmapClient({ tasks, milestones, phaseStatuses }: Props) {
  const router = useRouter();
  const [editingMs, setEditingMs] = useState<Milestone | null>(null);
  const [createPhase, setCreatePhase] = useState<RoadmapPhase | null>(null);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');

  function openCreate(phase: RoadmapPhase) {
    setEditingMs(null);
    setCreatePhase(phase);
    setMode('create');
  }
  function openEdit(m: Milestone) {
    setEditingMs(m);
    setCreatePhase(null);
    setMode('edit');
  }
  function close() {
    setMode('closed');
    setEditingMs(null);
    setCreatePhase(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            letterSpacing: '-0.02em',
            color: '#eaf6fb',
          }}
        >
          Roadmap
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'rgba(207,232,240,0.62)' }}>
          Voortgang per fase — afgeronde milestones / totaal, of taken-fallback waar geen milestones zijn.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {PHASE_INFO.map((info) => {
          const phaseMs = milestones.filter((m) => m.roadmapPhase === info.phase);
          const phaseTasks = tasks.filter((t) => t.roadmapPhase === info.phase);
          const prog = computePhaseProgress(milestones, tasks, info.phase);
          return (
            <PhaseCard
              key={info.phase}
              info={info}
              status={phaseStatuses[info.phase]}
              progress={prog}
              milestones={phaseMs}
              tasks={phaseTasks}
              onAddMilestone={() => openCreate(info.phase)}
              onEditMilestone={openEdit}
              onStatusChange={async (newStatus) => {
                const res = await setPhaseStatusAction(info.phase, newStatus);
                if (res.ok) router.refresh();
              }}
            />
          );
        })}
      </div>

      <MilestoneModal
        key={editingMs?.id ?? `new-${createPhase ?? 'none'}`}
        open={mode !== 'closed'}
        milestone={editingMs}
        candidateTasks={tasks}
        defaultPhase={createPhase ?? undefined}
        onClose={close}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhaseCard
// ---------------------------------------------------------------------------

type PhaseCardProps = {
  info: (typeof PHASE_INFO)[number];
  status: PhaseStatus;
  progress: ReturnType<typeof computePhaseProgress>;
  milestones: Milestone[];
  tasks: Task[];
  onAddMilestone: () => void;
  onEditMilestone: (m: Milestone) => void;
  onStatusChange: (status: PhaseStatus) => void;
};

function PhaseCard({
  info,
  status,
  progress,
  milestones,
  tasks,
  onAddMilestone,
  onEditMilestone,
  onStatusChange,
}: PhaseCardProps) {
  const [pending, startTransition] = useTransition();
  const isActive = status === 'Actief';
  const openTasks = tasks.filter((t) => t.status !== 'Klaar').length;

  return (
    <section
      style={{
        background: isActive
          ? 'linear-gradient(160deg, color-mix(in oklab, var(--manta-accent) 10%, transparent), rgba(255,255,255,0.025))'
          : 'rgba(255,255,255,0.025)',
        border: isActive
          ? '1px solid color-mix(in oklab, var(--manta-accent) 30%, transparent)'
          : '1px solid rgba(120,200,230,0.12)',
        borderRadius: 18,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                letterSpacing: '-0.01em',
                color: '#eaf6fb',
              }}
            >
              {info.label}
            </h2>
            <PhaseStatusBadge status={status} />
          </div>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 13,
              color: 'rgba(207,232,240,0.62)',
              lineHeight: 1.5,
            }}
          >
            {info.goal}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={status}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value as PhaseStatus;
              startTransition(() => onStatusChange(next));
            }}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(120,200,230,0.16)',
              borderRadius: 10,
              padding: '6px 10px',
              color: '#eaf6fb',
              fontSize: 12.5,
              outline: 'none',
              cursor: pending ? 'wait' : 'pointer',
            }}
          >
            {PHASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAddMilestone}
            style={{
              background: 'transparent',
              border: '1px solid color-mix(in oklab, var(--manta-accent) 40%, transparent)',
              color: 'color-mix(in oklab, var(--manta-accent) 30%, #ffffff)',
              padding: '6px 12px',
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="plus" size={12} />
            Milestone
          </button>
        </div>
      </header>

      {/* Progress */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            fontSize: 12,
          }}
        >
          <span style={{ color: 'rgba(207,232,240,0.55)' }}>
            {progress.source === 'milestones'
              ? `Milestones: ${progress.done} / ${progress.total} afgerond`
              : progress.source === 'tasks'
                ? `Taken (fallback): ${progress.done} / ${progress.total} klaar`
                : 'Nog niets ingepland in deze fase'}
          </span>
          {progress.total > 0 && (
            <span style={{ color: '#eaf6fb', fontWeight: 600 }}>
              {Math.round(progress.ratio * 100)}%
            </span>
          )}
        </div>
        {progress.total > 0 && (
          <ProgressBar ratio={progress.ratio} tone={progress.source === 'tasks' ? 'muted' : 'default'} />
        )}
      </div>

      {/* Focus tags */}
      {info.focus.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {info.focus.map((f) => (
            <span
              key={f}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(120,200,230,0.12)',
                color: 'rgba(207,232,240,0.65)',
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Milestones */}
      {milestones.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(207,232,240,0.5)',
              fontWeight: 500,
            }}
          >
            Milestones ({milestones.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {milestones.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onEditMilestone(m)}
                style={{
                  textAlign: 'left',
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(120,200,230,0.12)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: '#eaf6fb',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: m.status === 'Afgerond' ? 'rgba(207,232,240,0.55)' : '#eaf6fb',
                      textDecoration: m.status === 'Afgerond' ? 'line-through' : 'none',
                    }}
                  >
                    {m.title}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <MilestoneStatusBadge status={m.status} />
                    <OwnerBadge owner={m.owner} />
                  </span>
                </div>
                {m.acceptanceCriteria.length > 0 && (
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontSize: 12,
                      color: 'rgba(207,232,240,0.58)',
                      lineHeight: 1.5,
                    }}
                  >
                    {m.acceptanceCriteria.slice(0, 3).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                    {m.acceptanceCriteria.length > 3 && (
                      <li style={{ color: 'rgba(207,232,240,0.42)' }}>
                        + {m.acceptanceCriteria.length - 3} meer
                      </li>
                    )}
                  </ul>
                )}
                {m.linkedTaskIds.length > 0 && (
                  <span style={{ fontSize: 11.5, color: 'rgba(155,213,224,0.55)' }}>
                    Gekoppeld aan {m.linkedTaskIds.length} {m.linkedTaskIds.length === 1 ? 'taak' : 'taken'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Linked tasks summary */}
      {tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(207,232,240,0.5)',
              fontWeight: 500,
            }}
          >
            Taken in deze fase ({tasks.length}{openTasks !== tasks.length ? `, ${openTasks} open` : ''})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tasks.slice(0, 8).map((t) => (
              <span
                key={t.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(120,200,230,0.12)',
                  color: t.status === 'Klaar' ? 'rgba(207,232,240,0.45)' : '#eaf6fb',
                  textDecoration: t.status === 'Klaar' ? 'line-through' : 'none',
                }}
              >
                <PriorityBadge priority={t.priority} />
                {t.title}
                <StatusBadge status={t.status} />
              </span>
            ))}
            {tasks.length > 8 && (
              <span
                style={{
                  fontSize: 12,
                  color: 'rgba(155,213,224,0.55)',
                  padding: '4px 10px',
                }}
              >
                + {tasks.length - 8} meer in Taken-pagina
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
