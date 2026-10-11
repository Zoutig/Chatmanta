'use client';

// TaskCard — compacte taak-render. Wordt klikbaar (open TaskModal voor edit)
// in panels gebruikt.

import type { Task } from '@/lib/commandcenter/types';
import { isOverdue } from '@/lib/commandcenter/types';
import {
  LabelChip,
  OverdueBadge,
  PriorityBadge,
  StatusBadge,
} from './badges';

type Props = {
  task: Task;
  onClick?: (task: Task) => void;
  showOwner?: boolean;
};

function formatDeadline(d: string | null): string | null {
  if (!d) return null;
  // YYYY-MM-DD → 18 mei
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export function TaskCard({ task, onClick, showOwner }: Props) {
  const overdue = isOverdue(task);
  const deadlineFmt = formatDeadline(task.deadline);

  return (
    <button
      type="button"
      onClick={() => onClick?.(task)}
      style={{
        width: '100%',
        textAlign: 'left',
        background: 'var(--surface)',
        border: overdue
          ? '1px solid var(--bd-danger-border)'
          : task.status === 'Geblokkeerd'
            ? '1px solid var(--bd-danger-border)'
            : '1px solid var(--border-strong)',
        borderRadius: 14,
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 160ms ease, transform 160ms ease',
        color: 'var(--fg)',
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.borderColor = 'var(--border-bright)';
      }}
      onMouseLeave={(e) => {
        if (!onClick) return;
        e.currentTarget.style.borderColor = overdue
          ? 'var(--bd-danger-border)'
          : task.status === 'Geblokkeerd'
            ? 'var(--bd-danger-border)'
            : 'var(--border-strong)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.4,
            color: task.status === 'Klaar' ? 'var(--fg-muted)' : 'var(--fg)',
            textDecoration: task.status === 'Klaar' ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </span>
        <PriorityBadge priority={task.priority} />
      </div>

      {task.nextAction && task.status !== 'Klaar' && (
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: 'var(--fg-muted)',
            lineHeight: 1.45,
          }}
        >
          → {task.nextAction}
        </p>
      )}

      {task.status === 'Geblokkeerd' && task.blockerReason && (
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: 'var(--bd-danger-fg)',
            background: 'var(--bd-danger-bg)',
            border: '1px solid var(--bd-danger-border)',
            borderRadius: 8,
            padding: '6px 8px',
            lineHeight: 1.4,
          }}
        >
          Blokkade: {task.blockerReason}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <StatusBadge status={task.status} />
        {overdue && <OverdueBadge />}
        {deadlineFmt && (
          <span
            style={{
              fontSize: 11,
              color: overdue ? 'var(--bd-danger-fg)' : 'var(--fg-muted)',
              background: overdue ? 'var(--bd-danger-bg)' : 'var(--surface)',
              border: overdue
                ? '1px solid var(--bd-danger-border)'
                : '1px solid var(--border-strong)',
              borderRadius: 999,
              padding: '2px 8px',
            }}
          >
            {deadlineFmt}
          </span>
        )}
        {showOwner && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--fg-muted)',
              padding: '2px 6px',
            }}
          >
            {task.owner}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 10.5,
            color: 'var(--fg-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {task.projectArea}
        </span>
      </div>

      {task.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {task.labels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </div>
      )}
    </button>
  );
}
