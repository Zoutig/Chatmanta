'use client';

// Dashboard widgets — QuickStats, BlockedPanel, OverduePanel,
// DecisionsNeededPanel, FocusOfWeek. Allemaal presentational + click-to-edit
// via onTaskClick.

import type { Task } from '@/lib/commandcenter/types';
import { isOverdue } from '@/lib/commandcenter/types';
import { TaskCard } from './task-card';
import { OwnerBadge } from './badges';

// ---------------------------------------------------------------------------
// QuickStats
// ---------------------------------------------------------------------------

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(120,200,230,0.12)',
        borderRadius: 14,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'rgba(207,232,240,0.5)',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
          fontSize: 24,
          fontWeight: 600,
          color: accent ?? '#eaf6fb',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function QuickStats({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter((t) => t.status !== 'Klaar').length;
  const week = tasks.filter((t) => t.status === 'Deze week').length;
  const seb = tasks.filter((t) => t.owner === 'Sebastiaan' && t.status !== 'Klaar').length;
  const niels = tasks.filter((t) => t.owner === 'Niels' && t.status !== 'Klaar').length;
  const samen = tasks.filter((t) => t.owner === 'Samen' && t.status !== 'Klaar').length;
  const blocked = tasks.filter((t) => t.status === 'Geblokkeerd').length;
  const overdue = tasks.filter(isOverdue).length;
  const review = tasks.filter((t) => t.status === 'Review').length;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10,
      }}
    >
      <Stat label="Open" value={open} />
      <Stat label="Deze week" value={week} />
      <Stat label="Sebastiaan" value={seb} />
      <Stat label="Niels" value={niels} />
      <Stat label="Samen" value={samen} />
      <Stat label="Geblokkeerd" value={blocked} accent={blocked > 0 ? '#f1a5a5' : undefined} />
      <Stat label="Te laat" value={overdue} accent={overdue > 0 ? '#ffb3b3' : undefined} />
      <Stat label="In review" value={review} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockedPanel
// ---------------------------------------------------------------------------

export function BlockedPanel({
  tasks,
  onTaskClick,
}: {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}) {
  const blocked = tasks.filter((t) => t.status === 'Geblokkeerd');
  if (blocked.length === 0) return null;
  return (
    <section
      style={{
        background: 'rgba(220,90,90,0.06)',
        border: '1px solid rgba(220,90,90,0.30)',
        borderRadius: 18,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 600,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            color: '#f1a5a5',
          }}
        >
          Geblokkeerd
        </h3>
        <span style={{ fontSize: 12, color: 'rgba(241,165,165,0.7)' }}>
          ({blocked.length} {blocked.length === 1 ? 'taak' : 'taken'})
        </span>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {blocked.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <OwnerBadge owner={t.owner} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <TaskCard task={t} onClick={onTaskClick} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// OverduePanel
// ---------------------------------------------------------------------------

export function OverduePanel({
  tasks,
  onTaskClick,
}: {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}) {
  const overdue = tasks.filter(isOverdue);
  if (overdue.length === 0) return null;
  return (
    <section
      style={{
        background: 'rgba(220,90,90,0.06)',
        border: '1px solid rgba(220,90,90,0.28)',
        borderRadius: 18,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 600,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            color: '#ffb3b3',
          }}
        >
          Te laat
        </h3>
        <span style={{ fontSize: 12, color: 'rgba(255,179,179,0.7)' }}>
          ({overdue.length})
        </span>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {overdue.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <OwnerBadge owner={t.owner} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <TaskCard task={t} onClick={onTaskClick} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// DecisionsNeededPanel
// ---------------------------------------------------------------------------

export function DecisionsNeededPanel({
  tasks,
  onTaskClick,
}: {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}) {
  const decisions = tasks.filter(
    (t) => t.labels.includes('decision-needed') && t.status !== 'Klaar',
  );
  if (decisions.length === 0) return null;
  return (
    <section
      style={{
        background: 'rgba(230,180,90,0.05)',
        border: '1px solid rgba(230,180,90,0.26)',
        borderRadius: 18,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 600,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            color: '#f0d39a',
          }}
        >
          Beslissingen nodig
        </h3>
        <span style={{ fontSize: 12, color: 'rgba(240,211,154,0.7)' }}>
          ({decisions.length})
        </span>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {decisions.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <OwnerBadge owner={t.owner} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <TaskCard task={t} onClick={onTaskClick} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FocusOfWeek
// ---------------------------------------------------------------------------

export function FocusOfWeek({
  tasks,
  onTaskClick,
}: {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}) {
  // Top 3 prioriteiten = P1+Deze week, dan P1+Bezig, dan rest van P1.
  const candidates = tasks.filter((t) => t.status !== 'Klaar');
  const top: Task[] = [];
  const pickFrom = (pred: (t: Task) => boolean) => {
    for (const t of candidates) {
      if (top.length >= 3) break;
      if (top.includes(t)) continue;
      if (pred(t)) top.push(t);
    }
  };
  pickFrom((t) => t.priority === 'P1' && t.status === 'Deze week');
  pickFrom((t) => t.priority === 'P1' && t.status === 'Bezig');
  pickFrom((t) => t.priority === 'P1');
  pickFrom((t) => t.status === 'Deze week');

  const weekNumber = getWeekNumber(new Date());

  return (
    <section
      style={{
        background:
          'linear-gradient(160deg, color-mix(in oklab, var(--manta-accent) 12%, transparent), rgba(255,255,255,0.025))',
        border: '1px solid color-mix(in oklab, var(--manta-accent) 30%, transparent)',
        borderRadius: 20,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 600,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            color: '#eaf6fb',
            letterSpacing: '-0.01em',
          }}
        >
          Focus van deze week
        </h2>
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            color: 'color-mix(in oklab, var(--manta-accent) 30%, #ffffff)',
            background: 'color-mix(in oklab, var(--manta-accent) 14%, transparent)',
            border: '1px solid color-mix(in oklab, var(--manta-accent) 30%, transparent)',
            borderRadius: 999,
            padding: '3px 10px',
          }}
        >
          Week {weekNumber}
        </span>
      </header>

      {top.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'rgba(207,232,240,0.5)',
            fontStyle: 'italic',
          }}
        >
          Geen P1-taken deze week. Eventueel via Taken-pagina een focus
          inplannen.
        </p>
      ) : (
        <ol
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            counterReset: 'focus',
          }}
        >
          {top.map((t, i) => (
            <li
              key={t.id}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}
            >
              <span
                style={{
                  flex: '0 0 28px',
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: 'color-mix(in oklab, var(--manta-accent) 22%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--manta-accent) 40%, transparent)',
                  color: 'color-mix(in oklab, var(--manta-accent) 35%, #ffffff)',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TaskCard task={t} onClick={onTaskClick} showOwner />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
