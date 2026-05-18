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
        background: 'rgba(255,255,255,0.025)',
        border: overdue
          ? '1px solid rgba(220,90,90,0.30)'
          : task.status === 'Geblokkeerd'
            ? '1px solid rgba(220,90,90,0.20)'
            : '1px solid rgba(120,200,230,0.12)',
        borderRadius: 14,
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 160ms ease, transform 160ms ease',
        color: '#eaf6fb',
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.borderColor = 'rgba(120,200,230,0.28)';
      }}
      onMouseLeave={(e) => {
        if (!onClick) return;
        e.currentTarget.style.borderColor = overdue
          ? 'rgba(220,90,90,0.30)'
          : task.status === 'Geblokkeerd'
            ? 'rgba(220,90,90,0.20)'
            : 'rgba(120,200,230,0.12)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.4,
            color: task.status === 'Klaar' ? 'rgba(207,232,240,0.45)' : '#eaf6fb',
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
            color: 'rgba(207,232,240,0.62)',
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
            color: '#f1a5a5',
            background: 'rgba(220,90,90,0.08)',
            border: '1px solid rgba(220,90,90,0.22)',
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
              color: overdue ? '#ffb3b3' : 'rgba(155,213,224,0.65)',
              background: overdue ? 'rgba(220,90,90,0.08)' : 'rgba(120,200,230,0.05)',
              border: overdue
                ? '1px solid rgba(220,90,90,0.24)'
                : '1px solid rgba(120,200,230,0.14)',
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
              color: 'rgba(207,232,240,0.55)',
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
            color: 'rgba(155,213,224,0.42)',
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
