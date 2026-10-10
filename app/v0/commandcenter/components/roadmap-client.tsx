'use client';

// RoadmapClient — accordion-drilldown per fase.
//   Niveau 1: fase-kaart (ingeklapt; actieve fase open bij laden)
//   Niveau 2: milestones van die fase, elk met een taak-voortgangsbalkje
//   Niveau 3: de gekoppelde taken van een milestone
// Milestone zonder gekoppelde taken = "vrije invulling": geen balkje, wél
// acceptatie-criteria. Status-wissel persisteert via setPhaseStatusAction;
// milestone bewerken via de potlood-knop (opent MilestoneModal).

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  computeMilestoneTaskProgress,
  computePhaseProgress,
  isMilestoneEffectivelyDone,
  type Milestone,
  type RoadmapPhase,
  type Task,
} from '@/lib/commandcenter/types';
import {
  getActivePhase,
  PHASE_INFO,
  PHASE_STATUSES,
  type PhaseStatus,
} from '@/lib/commandcenter/roadmap-phases';
import { setPhaseStatusAction } from '@/app/actions/commandcenter';
import { Icon } from '@/app/components/svg-icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
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

/** Enter/Space op een div[role=button] → klik-actie. */
function onActivate(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
}

export function RoadmapClient({ tasks, milestones, phaseStatuses }: Props) {
  const router = useRouter();
  const [editingMs, setEditingMs] = useState<Milestone | null>(null);
  const [createPhase, setCreatePhase] = useState<RoadmapPhase | null>(null);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  // Accordion-state: welke fases / milestones staan open. Actieve fase open
  // bij eerste render.
  const [openPhases, setOpenPhases] = useState<Set<RoadmapPhase>>(
    () => new Set<RoadmapPhase>([getActivePhase()]),
  );
  const [openMilestones, setOpenMilestones] = useState<Set<string>>(
    () => new Set<string>(),
  );

  function togglePhase(phase: RoadmapPhase) {
    setOpenPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }
  function toggleMilestone(id: string) {
    setOpenMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
            color: 'var(--fg)',
          }}
        >
          Roadmap
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--fg-muted)' }}>
          Klik een fase open voor de milestones, en een milestone voor de
          gekoppelde taken.
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
              phaseTasks={phaseTasks}
              allTasks={tasks}
              expanded={openPhases.has(info.phase)}
              onToggle={() => togglePhase(info.phase)}
              openMilestones={openMilestones}
              onToggleMilestone={toggleMilestone}
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
// PhaseCard — niveau 1 (klikbare kop) + niveau 2/3 wanneer uitgeklapt.
// ---------------------------------------------------------------------------

type PhaseCardProps = {
  info: (typeof PHASE_INFO)[number];
  status: PhaseStatus;
  progress: ReturnType<typeof computePhaseProgress>;
  milestones: Milestone[];
  phaseTasks: Task[];
  allTasks: Task[];
  expanded: boolean;
  onToggle: () => void;
  openMilestones: Set<string>;
  onToggleMilestone: (id: string) => void;
  onAddMilestone: () => void;
  onEditMilestone: (m: Milestone) => void;
  onStatusChange: (status: PhaseStatus) => void;
};

function PhaseCard({
  info,
  status,
  progress,
  milestones,
  phaseTasks,
  allTasks,
  expanded,
  onToggle,
  openMilestones,
  onToggleMilestone,
  onAddMilestone,
  onEditMilestone,
  onStatusChange,
}: PhaseCardProps) {
  const [pending, startTransition] = useTransition();
  const isActive = status === 'Actief';

  const summary =
    progress.source === 'milestones'
      ? `${milestones.length} milestone${milestones.length === 1 ? '' : 's'} · ${progress.done}/${progress.total} afgerond`
      : progress.source === 'tasks'
        ? `${progress.total} taken (fallback) · ${progress.done} klaar`
        : 'Nog niets ingepland';

  // Taak-id's die al aan een milestone hangen — de rest tonen we als "overige".
  const linkedIds = new Set(milestones.flatMap((m) => m.linkedTaskIds));
  const orphanTasks = phaseTasks.filter((t) => !linkedIds.has(t.id));

  return (
    <section
      style={{
        background: isActive
          ? 'linear-gradient(160deg, color-mix(in oklab, var(--manta-accent) 10%, transparent), var(--surface))'
          : 'var(--surface)',
        border: isActive
          ? '1px solid color-mix(in oklab, var(--manta-accent) 30%, transparent)'
          : '1px solid var(--border)',
        borderRadius: 18,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: expanded ? 14 : 0,
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
        {/* Klikbare kop-regio — togglet de fase. */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={onToggle}
          onKeyDown={onActivate(onToggle)}
          style={{
            minWidth: 0,
            flex: '1 1 320px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            cursor: 'pointer',
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              marginTop: 4,
              color: 'var(--fg-muted)',
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 180ms ease',
            }}
          >
            <Icon name="caret" size={16} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 600,
                  fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                  letterSpacing: '-0.01em',
                  color: 'var(--fg)',
                }}
              >
                {info.label}
              </h2>
              <PhaseStatusBadge status={status} />
            </div>
            {/* Progress-samenvatting in de kop — altijd zichtbaar. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 8,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{summary}</span>
              {progress.total > 0 && (
                <span style={{ width: 140, maxWidth: '40vw' }}>
                  <ProgressBar
                    ratio={progress.ratio}
                    tone={progress.source === 'tasks' ? 'muted' : 'default'}
                  />
                </span>
              )}
              {progress.total > 0 && (
                <span style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 600 }}>
                  {Math.round(progress.ratio * 100)}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Controls — siblings van de klikbare kop, togglen de fase dus niet. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ minWidth: 160, opacity: pending ? 0.6 : 1 }}>
            <Select
              value={status}
              disabled={pending}
              onValueChange={(v) => {
                const next = v as PhaseStatus;
                startTransition(() => onStatusChange(next));
              }}
            >
              <SelectTrigger style={{ padding: '6px 10px', fontSize: 12.5 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHASE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            type="button"
            onClick={onAddMilestone}
            style={{
              background: 'transparent',
              border: '1px solid color-mix(in oklab, var(--manta-accent) 40%, transparent)',
              color: 'var(--manta-accent, var(--accent))',
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

      {expanded && (
        <>
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
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg-muted)',
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* Milestones (niveau 2) */}
          {milestones.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--fg-muted)',
                  fontWeight: 500,
                }}
              >
                Milestones ({milestones.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {milestones.map((m) => (
                  <MilestoneRow
                    key={m.id}
                    milestone={m}
                    allTasks={allTasks}
                    open={openMilestones.has(m.id)}
                    onToggle={() => onToggleMilestone(m.id)}
                    onEdit={() => onEditMilestone(m)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Taken (niveau "los"): bij milestones = overige ongekoppelde taken,
              zonder milestones = alle fase-taken als fallback. */}
          {milestones.length > 0
            ? orphanTasks.length > 0 && (
                <TaskChips
                  title={`Overige taken — niet aan milestone gekoppeld (${orphanTasks.length})`}
                  tasks={orphanTasks}
                />
              )
            : phaseTasks.length > 0
              ? (
                <TaskChips
                  title={`Taken in deze fase (${phaseTasks.length})`}
                  tasks={phaseTasks}
                />
              )
              : (
                <p style={{ fontSize: 13, color: 'var(--fg-muted)', fontStyle: 'italic', margin: 0 }}>
                  Nog niets ingepland in deze fase.
                </p>
              )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// MilestoneRow — niveau 2 rij + niveau 3 (taken/criteria) wanneer open.
// ---------------------------------------------------------------------------

function MilestoneRow({
  milestone: m,
  allTasks,
  open,
  onToggle,
  onEdit,
}: {
  milestone: Milestone;
  allTasks: Task[];
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const prog = computeMilestoneTaskProgress(m, allTasks);
  const autoDone = m.status !== 'Afgerond' && isMilestoneEffectivelyDone(m, allTasks);
  const looksDone = m.status === 'Afgerond' || autoDone;
  const linkedTasks = allTasks.filter((t) => m.linkedTaskIds.includes(t.id));
  const hasTasks = prog.total > 0;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Kop-rij: klikbare disclosure + losse potlood-knop (geen geneste buttons). */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${m.title} — taken ${open ? 'inklappen' : 'uitklappen'}`}
        onClick={onToggle}
        onKeyDown={onActivate(onToggle)}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '10px 12px',
          cursor: 'pointer',
          color: 'var(--fg)',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            marginTop: 3,
            color: 'var(--fg-muted)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 180ms ease',
          }}
        >
          <Icon name="caret" size={14} />
        </span>

        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 500,
                color: looksDone ? 'var(--fg-muted)' : 'var(--fg)',
                textDecoration: looksDone ? 'line-through' : 'none',
              }}
            >
              {m.title}
            </span>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {autoDone && (
                <span
                  title="Alle gekoppelde taken zijn klaar — open milestone om handmatig op 'Afgerond' te zetten."
                  style={{
                    fontSize: 10.5,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '2px 7px',
                    borderRadius: 999,
                    background: 'var(--bd-success-bg)',
                    border: '1px solid var(--bd-success-border)',
                    color: 'var(--bd-success-fg)',
                    fontWeight: 500,
                  }}
                >
                  Auto-klaar
                </span>
              )}
              <MilestoneStatusBadge status={m.status} />
              <OwnerBadge owner={m.owner} />
            </span>
          </div>

          {/* Taak-voortgang óf vrije-invulling-label */}
          {hasTasks ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, maxWidth: 320 }}>
                <ProgressBar ratio={prog.ratio} />
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                {prog.done}/{prog.total} taken klaar
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontStyle: 'italic' }}>
              · vrije invulling — geen gekoppelde taken ·
            </span>
          )}
        </div>

      </div>
        {/* Potlood — bewerken; losse knop naast de disclosure (niet genest). */}
        <button
          type="button"
          aria-label="Milestone bewerken"
          title="Bewerken"
          onClick={onEdit}
          style={{
            flexShrink: 0,
            alignSelf: 'flex-start',
            margin: '10px 12px 0 0',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--fg-muted)',
            borderRadius: 8,
            padding: '5px 7px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <Icon name="edit" size={13} />
        </button>
      </div>

      {/* Niveau 3 — gekoppelde taken óf (bij vrije invulling) criteria */}
      {open && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '10px 12px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'color-mix(in oklab, var(--surface) 60%, var(--bg))',
          }}
        >
          {m.description && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
              {m.description}
            </p>
          )}

          {hasTasks ? (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {linkedTasks.map((t) => (
                <li
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    padding: '6px 8px',
                    borderRadius: 8,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <PriorityBadge priority={t.priority} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: t.status === 'Klaar' ? 'var(--fg-faint)' : 'var(--fg)',
                      textDecoration: t.status === 'Klaar' ? 'line-through' : 'none',
                    }}
                  >
                    {t.title}
                  </span>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          ) : (
            <>
              {m.acceptanceCriteria.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                  {m.acceptanceCriteria.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--fg-faint)', fontStyle: 'italic' }}>
                Geen taken gekoppeld — vrije invulling. Voortgang loopt via de
                milestone-status.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskChips — compacte taken-lijst (overige / fallback) als chips.
// ---------------------------------------------------------------------------

function TaskChips({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h3
        style={{
          margin: 0,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-muted)',
          fontWeight: 500,
        }}
      >
        {title}
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
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: t.status === 'Klaar' ? 'var(--fg-faint)' : 'var(--fg)',
              textDecoration: t.status === 'Klaar' ? 'line-through' : 'none',
            }}
          >
            <PriorityBadge priority={t.priority} />
            {t.title}
            <StatusBadge status={t.status} />
          </span>
        ))}
        {tasks.length > 8 && (
          <span style={{ fontSize: 12, color: 'var(--fg-muted)', padding: '4px 10px' }}>
            + {tasks.length - 8} meer in Taken-pagina
          </span>
        )}
      </div>
    </div>
  );
}
