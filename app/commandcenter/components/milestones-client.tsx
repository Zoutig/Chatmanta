'use client';

// MilestonesClient — lijst van alle milestones met filter per fase + CRUD via
// MilestoneModal. Klikken op een milestone-rij opent edit-mode.

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  compareMilestones,
  ROADMAP_PHASES,
  type Milestone,
  type RoadmapPhase,
  type Task,
} from '@/lib/commandcenter/types';
import { Icon } from '@/app/components/svg-icons';
import { MilestoneStatusBadge, OwnerBadge } from './badges';
import { MilestoneModal } from './milestone-modal';

type Props = { milestones: Milestone[]; tasks: Task[] };

type FilterState = { phase: RoadmapPhase | 'all' };

function applyFilter(ms: Milestone[], f: FilterState): Milestone[] {
  let res = ms;
  if (f.phase !== 'all') res = res.filter((m) => m.roadmapPhase === f.phase);
  return res.slice().sort(compareMilestones);
}

function formatDeadline(d: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export function MilestonesClient({ milestones, tasks }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterState>({ phase: 'all' });
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');

  const visible = useMemo(() => applyFilter(milestones, filter), [milestones, filter]);

  function openCreate() {
    setEditing(null);
    setMode('create');
  }
  function openEdit(m: Milestone) {
    setEditing(m);
    setMode('edit');
  }
  function close() {
    setMode('closed');
    setEditing(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
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
            Milestones
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 13.5,
              color: 'rgba(207,232,240,0.62)',
            }}
          >
            {milestones.length} milestone{milestones.length === 1 ? '' : 's'} — {visible.length} zichtbaar.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          style={{
            background: 'var(--manta-accent)',
            border: '1px solid color-mix(in oklab, var(--manta-accent) 50%, transparent)',
            color: '#03171a',
            padding: '10px 16px',
            borderRadius: 12,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="plus" size={14} />
          Nieuwe milestone
        </button>
      </header>

      {/* Filter chips per fase */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <FilterChip
          label="Alle fases"
          active={filter.phase === 'all'}
          onClick={() => setFilter({ phase: 'all' })}
        />
        {ROADMAP_PHASES.map((p) => {
          const count = milestones.filter((m) => m.roadmapPhase === p).length;
          if (count === 0) return null;
          return (
            <FilterChip
              key={p}
              label={`${p} (${count})`}
              active={filter.phase === p}
              onClick={() => setFilter({ phase: p })}
            />
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p
          style={{
            fontSize: 13.5,
            color: 'rgba(207,232,240,0.5)',
            fontStyle: 'italic',
            padding: 24,
            textAlign: 'center',
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(120,200,230,0.12)',
            borderRadius: 14,
          }}
        >
          Nog geen milestones in deze fase.
        </p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(120,200,230,0.12)',
            borderRadius: 14,
            padding: 10,
          }}
        >
          {visible.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => openEdit(m)}
              style={{
                textAlign: 'left',
                background: 'transparent',
                border: '1px solid rgba(120,200,230,0.10)',
                borderRadius: 10,
                padding: '12px 14px',
                cursor: 'pointer',
                color: '#eaf6fb',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: m.status === 'Afgerond' ? 'rgba(207,232,240,0.55)' : '#eaf6fb',
                    textDecoration: m.status === 'Afgerond' ? 'line-through' : 'none',
                  }}
                >
                  {m.title}
                </span>
                {m.description && (
                  <span style={{ fontSize: 12.5, color: 'rgba(207,232,240,0.58)' }}>
                    {m.description}
                  </span>
                )}
                {m.acceptanceCriteria.length > 0 && (
                  <span style={{ fontSize: 11.5, color: 'rgba(155,213,224,0.55)' }}>
                    {m.acceptanceCriteria.length} acceptatie-criteri
                    {m.acceptanceCriteria.length === 1 ? 'um' : 'a'}
                    {m.linkedTaskIds.length > 0 &&
                      ` · ${m.linkedTaskIds.length} taak${m.linkedTaskIds.length === 1 ? '' : 'en'} gekoppeld`}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: 'rgba(120,200,230,0.05)',
                    border: '1px solid rgba(120,200,230,0.14)',
                    color: 'rgba(155,213,224,0.7)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {m.roadmapPhase}
                </span>
                <MilestoneStatusBadge status={m.status} />
                <OwnerBadge owner={m.owner} />
                <span style={{ fontSize: 12, color: 'rgba(207,232,240,0.55)' }}>
                  {formatDeadline(m.deadline)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <MilestoneModal
        key={editing?.id ?? 'new'}
        open={mode !== 'closed'}
        milestone={editing}
        candidateTasks={tasks}
        onClose={close}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active
          ? 'color-mix(in oklab, var(--manta-accent) 18%, transparent)'
          : 'rgba(255,255,255,0.03)',
        border: active
          ? '1px solid color-mix(in oklab, var(--manta-accent) 38%, transparent)'
          : '1px solid rgba(120,200,230,0.14)',
        color: active
          ? 'color-mix(in oklab, var(--manta-accent) 30%, #ffffff)'
          : 'rgba(207,232,240,0.72)',
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
