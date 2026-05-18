'use client';

// DashboardClient — orkestreert modal-state + render van alle dashboard
// secties. Server component (page.tsx) levert initialTasks + milestones +
// phaseStatuses; na een mutatie triggert de server-action revalidatePath
// waardoor de page re-rendert en we verse data binnenkrijgen.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Milestone, RoadmapPhase, Task } from '@/lib/commandcenter/types';
import type { PhaseStatus } from '@/lib/commandcenter/roadmap-phases';
import { OwnerTodoPanel } from './owner-todo-panel';
import { TaskModal } from './task-modal';
import {
  BlockedPanel,
  DecisionsNeededPanel,
  FocusOfWeek,
  OverduePanel,
  QuickStats,
  RoadmapProgress,
} from './dashboard-widgets';
import { Icon } from '@/app/components/svg-icons';

type DashboardClientProps = {
  initialTasks: Task[];
  milestones: Milestone[];
  phaseStatuses: Record<RoadmapPhase, PhaseStatus>;
};

export function DashboardClient({
  initialTasks,
  milestones,
  phaseStatuses,
}: DashboardClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<Task | null>(null);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');

  function openCreate() {
    setEditing(null);
    setMode('create');
  }
  function openEdit(t: Task) {
    setEditing(t);
    setMode('edit');
  }
  function close() {
    setMode('closed');
    setEditing(null);
  }
  function onSaved() {
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Header */}
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
              fontSize: 30,
              fontWeight: 700,
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              letterSpacing: '-0.02em',
              background: 'linear-gradient(180deg, #f3fbff 0%, #b8dfe9 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            ChatManta Command Center
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 14,
              color: 'rgba(207,232,240,0.62)',
            }}
          >
            Founder cockpit voor taken, roadmap, beslissingen en testklanten.
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
            boxShadow:
              '0 12px 36px -16px color-mix(in oklab, var(--manta-accent) 60%, transparent)',
          }}
        >
          <Icon name="plus" size={14} />
          Nieuwe taak
        </button>
      </header>

      <FocusOfWeek tasks={initialTasks} onTaskClick={openEdit} />

      {/* 3 hoofd-owner panels */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
        }}
      >
        <OwnerTodoPanel owner="Sebastiaan" tasks={initialTasks} onTaskClick={openEdit} />
        <OwnerTodoPanel owner="Niels" tasks={initialTasks} onTaskClick={openEdit} />
        <OwnerTodoPanel owner="Samen" tasks={initialTasks} onTaskClick={openEdit} />
      </div>

      <OwnerTodoPanel
        owner="Nog toe te wijzen"
        tasks={initialTasks}
        onTaskClick={openEdit}
        variant="small"
      />

      <QuickStats tasks={initialTasks} />

      <BlockedPanel tasks={initialTasks} onTaskClick={openEdit} />
      <OverduePanel tasks={initialTasks} onTaskClick={openEdit} />
      <DecisionsNeededPanel tasks={initialTasks} onTaskClick={openEdit} />

      <RoadmapProgress
        tasks={initialTasks}
        milestones={milestones}
        phaseStatuses={phaseStatuses}
      />

      {/* Placeholder voor PR 3 features */}
      <section
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(120,200,230,0.18)',
          borderRadius: 16,
          padding: 18,
          color: 'rgba(207,232,240,0.55)',
          fontSize: 13,
        }}
      >
        Wekelijkse check-ins, beslissingenlog en sales-pipeline komen in de
        volgende PR.
      </section>

      <TaskModal
        key={editing?.id ?? 'new'}
        open={mode !== 'closed'}
        task={editing}
        onClose={close}
        onSaved={onSaved}
      />
    </div>
  );
}
