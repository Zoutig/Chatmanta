'use client';

// OwnerTodoPanel — één van de 4 dashboard-kaarten (Sebastiaan / Niels / Samen
// / Nog toe te wijzen). Sortering per goal-prompt §6.2:
//   1. Overdue P1
//   2. P1 deze week
//   3. P2 deze week
//   4. Bezig
//   5. Geblokkeerd
//   6. rest

import type { Owner, Task } from '@/lib/commandcenter/types';
import { isOverdue } from '@/lib/commandcenter/types';
import { TaskCard } from './task-card';

type Props = {
  owner: Owner;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  variant?: 'large' | 'small';
};

function bucket(t: Task): number {
  const overdue = isOverdue(t);
  if (overdue && t.priority === 'P1') return 0;
  if (t.priority === 'P1' && t.status === 'Deze week') return 1;
  if (t.priority === 'P2' && t.status === 'Deze week') return 2;
  if (t.status === 'Bezig') return 3;
  if (t.status === 'Geblokkeerd') return 4;
  if (t.status === 'Klaar') return 99;
  return 10;
}

function sortByBucket(a: Task, b: Task): number {
  const ba = bucket(a);
  const bb = bucket(b);
  if (ba !== bb) return ba - bb;
  // tiebreak: deadline asc
  const da = a.deadline ?? '9999-12-31';
  const db = b.deadline ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  return a.title.localeCompare(b.title);
}

const OWNER_ACCENT: Record<Owner, string> = {
  Sebastiaan: 'rgba(120,170,255,0.40)',
  Niels: 'rgba(255,150,120,0.40)',
  Samen: 'color-mix(in oklab, var(--manta-accent) 38%, transparent)',
  'Nog toe te wijzen': 'rgba(207,232,240,0.20)',
};

export function OwnerTodoPanel({ owner, tasks, onTaskClick, variant = 'large' }: Props) {
  const ownerTasks = tasks
    .filter((t) => t.owner === owner && t.status !== 'Klaar')
    .sort(sortByBucket);
  const openCount = ownerTasks.length;
  const overdueCount = ownerTasks.filter(isOverdue).length;
  const blockedCount = ownerTasks.filter((t) => t.status === 'Geblokkeerd').length;
  const isSmall = variant === 'small';

  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid ${OWNER_ACCENT[owner]}`,
        borderRadius: 18,
        padding: isSmall ? 16 : 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: isSmall ? 180 : 240,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: isSmall ? 15 : 17,
            fontWeight: 600,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            letterSpacing: '-0.01em',
            color: '#eaf6fb',
          }}
        >
          {owner === 'Samen'
            ? 'Samen'
            : owner === 'Nog toe te wijzen'
              ? 'Nog toe te wijzen'
              : `${owner}'s to-do`}
        </h3>
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'rgba(207,232,240,0.5)',
          }}
        >
          {openCount} open
          {overdueCount > 0 && (
            <>
              {' '}
              ·{' '}
              <span style={{ color: '#ffb3b3' }}>{overdueCount} te laat</span>
            </>
          )}
          {blockedCount > 0 && (
            <>
              {' '}
              ·{' '}
              <span style={{ color: '#f1a5a5' }}>{blockedCount} blocked</span>
            </>
          )}
        </span>
      </header>

      {ownerTasks.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'rgba(207,232,240,0.5)',
            fontStyle: 'italic',
            padding: '20px 0',
            textAlign: 'center',
          }}
        >
          Geen open taken.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ownerTasks.slice(0, isSmall ? 4 : 8).map((t) => (
            <TaskCard key={t.id} task={t} onClick={onTaskClick} />
          ))}
          {ownerTasks.length > (isSmall ? 4 : 8) && (
            <p
              style={{
                fontSize: 12,
                color: 'rgba(155,213,224,0.55)',
                margin: '4px 0 0',
                textAlign: 'center',
              }}
            >
              + {ownerTasks.length - (isSmall ? 4 : 8)} meer — zie Taken-pagina
            </p>
          )}
        </div>
      )}
    </section>
  );
}
