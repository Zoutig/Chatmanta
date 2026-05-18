'use client';

// TasksClient — Tasks-pagina orchestrator: filters + lijst + modal.
// Filters zijn client-side (sneller dan round-trip naar server) — alle taken
// komen één keer mee in initialTasks.

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  compareTasks,
  isOverdue,
  OWNERS,
  type Owner,
  type Priority,
  type Task,
  type TaskStatus,
} from '@/lib/commandcenter/types';
import { Icon } from '@/app/components/svg-icons';
import { TaskModal } from './task-modal';
import { LabelChip, OwnerBadge, OverdueBadge, PriorityBadge, StatusBadge } from './badges';

type QuickFilter =
  | { kind: 'all' }
  | { kind: 'owner'; owner: Owner }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'status'; status: TaskStatus }
  | { kind: 'overdue' };

const QUICK_FILTERS: { id: string; label: string; filter: QuickFilter }[] = [
  { id: 'all', label: 'Alles', filter: { kind: 'all' } },
  { id: 'owner-Sebastiaan', label: 'Sebastiaan', filter: { kind: 'owner', owner: 'Sebastiaan' } },
  { id: 'owner-Niels', label: 'Niels', filter: { kind: 'owner', owner: 'Niels' } },
  { id: 'owner-Samen', label: 'Samen', filter: { kind: 'owner', owner: 'Samen' } },
  {
    id: 'owner-Nog',
    label: 'Nog toe te wijzen',
    filter: { kind: 'owner', owner: 'Nog toe te wijzen' },
  },
  { id: 'p1', label: 'P1', filter: { kind: 'priority', priority: 'P1' } },
  { id: 'week', label: 'Deze week', filter: { kind: 'status', status: 'Deze week' } },
  { id: 'blocked', label: 'Geblokkeerd', filter: { kind: 'status', status: 'Geblokkeerd' } },
  { id: 'overdue', label: 'Te laat', filter: { kind: 'overdue' } },
];

function applyFilter(tasks: Task[], f: QuickFilter, search: string): Task[] {
  let res = tasks;
  if (f.kind === 'owner') res = res.filter((t) => t.owner === f.owner);
  else if (f.kind === 'priority') res = res.filter((t) => t.priority === f.priority);
  else if (f.kind === 'status') res = res.filter((t) => t.status === f.status);
  else if (f.kind === 'overdue') res = res.filter(isOverdue);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    res = res.filter((t) =>
      [
        t.title,
        t.description ?? '',
        t.nextAction ?? '',
        t.projectArea,
        t.owner,
        ...t.labels,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }
  return res.slice().sort(compareTasks);
}

export function TasksClient({ initialTasks }: { initialTasks: Task[] }) {
  const router = useRouter();
  const [filterId, setFilterId] = useState('all');
  const [search, setSearch] = useState('');
  const [groupByOwner, setGroupByOwner] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');

  const visible = useMemo(() => {
    const filter = QUICK_FILTERS.find((q) => q.id === filterId)?.filter ?? { kind: 'all' };
    return applyFilter(initialTasks, filter, search);
  }, [initialTasks, filterId, search]);

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
            Taken
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 13.5,
              color: 'rgba(207,232,240,0.62)',
            }}
          >
            {initialTasks.length} taken in totaal — {visible.length} zichtbaar.
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
          Nieuwe taak
        </button>
      </header>

      {/* Filters bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_FILTERS.map((q) => {
            const active = filterId === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setFilterId(q.id)}
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
                {q.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flex: '1 1 240px',
              maxWidth: 380,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(120,200,230,0.14)',
              borderRadius: 10,
              padding: '6px 10px',
            }}
          >
            <Icon name="search" size={14} className="text-[rgba(207,232,240,0.5)]" />
            <input
              type="search"
              placeholder="Zoek in taken…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#eaf6fb',
                fontSize: 13.5,
              }}
            />
          </div>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              color: 'rgba(207,232,240,0.6)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={groupByOwner}
              onChange={(e) => setGroupByOwner(e.target.checked)}
            />
            Groepeer per eigenaar
          </label>
        </div>
      </div>

      {/* Task list */}
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
          Geen taken die aan deze filters voldoen.
        </p>
      ) : groupByOwner ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {OWNERS.map((o) => {
            const list = visible.filter((t) => t.owner === o);
            if (list.length === 0) return null;
            return (
              <section key={o} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <OwnerBadge owner={o} />
                  <span style={{ fontSize: 12, color: 'rgba(207,232,240,0.5)' }}>
                    {list.length} {list.length === 1 ? 'taak' : 'taken'}
                  </span>
                </header>
                <TaskTable rows={list} onClick={openEdit} hideOwner />
              </section>
            );
          })}
        </div>
      ) : (
        <TaskTable rows={visible} onClick={openEdit} />
      )}

      <TaskModal
        key={editing?.id ?? 'new'}
        open={mode !== 'closed'}
        task={editing}
        onClose={close}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task table
// ---------------------------------------------------------------------------

function formatDeadline(d: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
  });
}

function TaskTable({
  rows,
  onClick,
  hideOwner,
}: {
  rows: Task[];
  onClick: (t: Task) => void;
  hideOwner?: boolean;
}) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(120,200,230,0.12)',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13.5,
        }}
      >
        <thead>
          <tr
            style={{
              background: 'rgba(255,255,255,0.02)',
              borderBottom: '1px solid rgba(120,200,230,0.10)',
            }}
          >
            <Th>Taak</Th>
            {!hideOwner && <Th>Eigenaar</Th>}
            <Th>Status</Th>
            <Th>Prio</Th>
            <Th>Deadline</Th>
            <Th>Projectgebied</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              onClick={() => onClick(t)}
              style={{
                cursor: 'pointer',
                borderBottom: '1px solid rgba(120,200,230,0.06)',
                transition: 'background-color 140ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(120,200,230,0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span
                    style={{
                      color: t.status === 'Klaar' ? 'rgba(207,232,240,0.45)' : '#eaf6fb',
                      textDecoration: t.status === 'Klaar' ? 'line-through' : 'none',
                      fontWeight: 500,
                    }}
                  >
                    {t.title}
                  </span>
                  {t.nextAction && t.status !== 'Klaar' && (
                    <span style={{ fontSize: 12, color: 'rgba(207,232,240,0.55)' }}>
                      → {t.nextAction}
                    </span>
                  )}
                  {t.labels.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                      {t.labels.map((l) => (
                        <LabelChip key={l} label={l} />
                      ))}
                    </div>
                  )}
                </div>
              </Td>
              {!hideOwner && (
                <Td>
                  <OwnerBadge owner={t.owner} />
                </Td>
              )}
              <Td>
                <StatusBadge status={t.status} />
              </Td>
              <Td>
                <PriorityBadge priority={t.priority} />
              </Td>
              <Td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: isOverdue(t) ? '#ffb3b3' : 'rgba(207,232,240,0.7)' }}>
                    {formatDeadline(t.deadline)}
                  </span>
                  {isOverdue(t) && <OverdueBadge />}
                </span>
              </Td>
              <Td>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'rgba(155,213,224,0.65)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {t.projectArea}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 14px',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'rgba(207,232,240,0.48)',
        fontWeight: 500,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: '12px 14px',
        verticalAlign: 'top',
        color: '#eaf6fb',
      }}
    >
      {children}
    </td>
  );
}
