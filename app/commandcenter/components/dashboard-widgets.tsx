'use client';

// Dashboard widgets — QuickStats, BlockedPanel, OverduePanel,
// DecisionsNeededPanel, FocusOfWeek, RoadmapProgress. Allemaal presentational
// + click-to-edit via onTaskClick.

import Link from 'next/link';
import {
  CUSTOMER_STATUSES,
  computePhaseProgress,
  isOverdue,
  type CheckIn,
  type CustomerStatus,
  type Decision,
  type Milestone,
  type RoadmapPhase,
  type Task,
  type TestCustomer,
} from '@/lib/commandcenter/types';
import { getActivePhase, getPhaseInfo, type PhaseStatus } from '@/lib/commandcenter/roadmap-phases';
import { TaskCard } from './task-card';
import {
  CustomerStatusBadge,
  DecisionStatusBadge,
  MilestoneStatusBadge,
  OwnerBadge,
  PhaseStatusBadge,
  ProgressBar,
} from './badges';

// ---------------------------------------------------------------------------
// QuickStats
// ---------------------------------------------------------------------------

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
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
          color: 'var(--fg-muted)',
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
          color: accent ?? 'var(--fg)',
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
      <Stat label="Geblokkeerd" value={blocked} accent={blocked > 0 ? 'var(--bd-danger-fg)' : undefined} />
      <Stat label="Te laat" value={overdue} accent={overdue > 0 ? 'var(--bd-danger-fg)' : undefined} />
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
        background: 'var(--bd-danger-bg)',
        border: '1px solid var(--bd-danger-border)',
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
            color: 'var(--bd-danger-fg)',
          }}
        >
          Geblokkeerd
        </h3>
        <span style={{ fontSize: 12, color: 'color-mix(in oklab, var(--bd-danger-fg) 75%, transparent)' }}>
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
        background: 'var(--bd-danger-bg)',
        border: '1px solid var(--bd-danger-border)',
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
            color: 'var(--bd-danger-fg)',
          }}
        >
          Te laat
        </h3>
        <span style={{ fontSize: 12, color: 'color-mix(in oklab, var(--bd-danger-fg) 75%, transparent)' }}>
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
        background: 'var(--bd-warn-bg)',
        border: '1px solid var(--bd-warn-border)',
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
            color: 'var(--bd-warn-fg)',
          }}
        >
          Beslissingen nodig
        </h3>
        <span style={{ fontSize: 12, color: 'color-mix(in oklab, var(--bd-warn-fg) 75%, transparent)' }}>
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
          'linear-gradient(160deg, color-mix(in oklab, var(--manta-accent) 12%, transparent), var(--surface))',
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
            color: 'var(--fg)',
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
            color: 'var(--manta-accent, var(--accent))',
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
            color: 'var(--fg-muted)',
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
                  color: 'var(--manta-accent, var(--accent))',
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

// ---------------------------------------------------------------------------
// RoadmapProgress — dashboard-widget voor de actieve fase.
// ---------------------------------------------------------------------------

export function RoadmapProgress({
  tasks,
  milestones,
  phaseStatuses,
}: {
  tasks: Task[];
  milestones: Milestone[];
  phaseStatuses: Record<RoadmapPhase, PhaseStatus>;
}) {
  const activePhase = getActivePhase();
  const info = getPhaseInfo(activePhase);
  const status = phaseStatuses[activePhase];
  const progress = computePhaseProgress(milestones, tasks, activePhase);
  const phaseMs = milestones.filter((m) => m.roadmapPhase === activePhase);
  const openMs = phaseMs.filter((m) => m.status !== 'Afgerond').slice(0, 4);
  const linkedP1 = tasks
    .filter((t) => t.roadmapPhase === activePhase && t.priority === 'P1' && t.status !== 'Klaar')
    .slice(0, 3);

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid color-mix(in oklab, var(--manta-accent) 22%, transparent)',
        borderRadius: 18,
        padding: 20,
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
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              letterSpacing: '-0.01em',
              color: 'var(--fg)',
            }}
          >
            Roadmap-voortgang · {info.label}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-muted)' }}>
            {info.goal}
          </p>
        </div>
        <PhaseStatusBadge status={status} />
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--fg-muted)' }}>
            {progress.source === 'milestones'
              ? `${progress.done} / ${progress.total} milestones afgerond`
              : progress.source === 'tasks'
                ? `${progress.done} / ${progress.total} taken klaar (fallback)`
                : 'Nog niets ingepland'}
          </span>
          {progress.total > 0 && (
            <span style={{ color: 'var(--fg)', fontWeight: 600 }}>
              {Math.round(progress.ratio * 100)}%
            </span>
          )}
        </div>
        {progress.total > 0 && (
          <ProgressBar ratio={progress.ratio} tone={progress.source === 'tasks' ? 'muted' : 'default'} />
        )}
      </div>

      {(openMs.length > 0 || linkedP1.length > 0) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {openMs.length > 0 && (
            <div>
              <h4
                style={{
                  margin: '0 0 6px',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--fg-muted)',
                  fontWeight: 500,
                }}
              >
                Open milestones
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {openMs.map((m) => (
                  <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MilestoneStatusBadge status={m.status} />
                    <span style={{ fontSize: 13, color: 'var(--fg)' }}>{m.title}</span>
                  </li>
                ))}
                {phaseMs.length - openMs.length > 0 && (
                  <li style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                    + {phaseMs.length - openMs.length} meer afgerond
                  </li>
                )}
              </ul>
            </div>
          )}
          {linkedP1.length > 0 && (
            <div>
              <h4
                style={{
                  margin: '0 0 6px',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--fg-muted)',
                  fontWeight: 500,
                }}
              >
                P1-taken in deze fase
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {linkedP1.map((t) => (
                  <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <OwnerBadge owner={t.owner} />
                    <span style={{ fontSize: 13, color: 'var(--fg)' }}>{t.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Link
        href="/commandcenter/roadmap"
        style={{
          fontSize: 12.5,
          color: 'var(--manta-accent, var(--accent))',
          textDecoration: 'none',
          marginTop: 2,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        Open volledige roadmap →
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// LatestCheckIn — laatste week-retro + 3 prioriteiten (PR 3 / goal-prompt §12)
// ---------------------------------------------------------------------------

export function LatestCheckIn({ checkIns }: { checkIns: CheckIn[] }) {
  if (checkIns.length === 0) {
    return (
      <section
        style={{
          background: 'var(--surface)',
          border: '1px dashed var(--border-strong)',
          borderRadius: 16,
          padding: 18,
          color: 'var(--fg-muted)',
          fontSize: 13,
        }}
      >
        Nog geen check-ins.{' '}
        <Link
          href="/commandcenter/checkins"
          style={{ color: 'var(--bd-info-fg)', textDecoration: 'underline' }}
        >
          Begin met een wekelijkse check-in
        </Link>{' '}
        om prioriteiten op het dashboard te tonen.
      </section>
    );
  }
  const latest = checkIns[0];
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 16,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            }}
          >
            Laatste check-in — {latest.weekLabel}
          </h2>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 12,
              color: 'var(--fg-muted)',
            }}
          >
            {latest.date}
            {latest.attendees.length > 0 && ' · ' + latest.attendees.join(', ')}
          </p>
        </div>
        <Link
          href="/commandcenter/checkins"
          style={{
            fontSize: 12,
            color: 'var(--manta-accent, var(--accent))',
            textDecoration: 'none',
          }}
        >
          Alle check-ins →
        </Link>
      </div>
      {latest.nextPriorities.length > 0 ? (
        <div>
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--fg-muted)',
              marginBottom: 6,
            }}
          >
            Prioriteiten deze week
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.5 }}>
            {latest.nextPriorities.slice(0, 3).map((p, i) => (
              <li key={i} style={{ color: 'var(--fg)' }}>
                {p}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
          Geen prioriteiten gezet voor deze week.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ActiveDecisions — meest recente actieve beslissingen (PR 3 / goal-prompt §13)
// ---------------------------------------------------------------------------

export function ActiveDecisions({ decisions }: { decisions: Decision[] }) {
  const items = decisions.filter((d) => d.status !== 'Geannuleerd').slice(0, 4);
  if (items.length === 0) {
    return (
      <section
        style={{
          background: 'var(--surface)',
          border: '1px dashed var(--border-strong)',
          borderRadius: 16,
          padding: 18,
          color: 'var(--fg-muted)',
          fontSize: 13,
        }}
      >
        Nog geen actieve beslissingen vastgelegd.
      </section>
    );
  }
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 16,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
          }}
        >
          Recente beslissingen
        </h2>
        <Link
          href="/commandcenter/decisions"
          style={{
            fontSize: 12,
            color: 'var(--manta-accent, var(--accent))',
            textDecoration: 'none',
          }}
        >
          Alle beslissingen →
        </Link>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((d) => (
          <li
            key={d.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '8px 10px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 13.5, color: 'var(--fg)' }}>{d.title}</span>
              <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                {d.date}
              </span>
            </div>
            <DecisionStatusBadge status={d.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// PipelineSnapshot — counts per pipeline-status (PR 3 / goal-prompt §14)
// ---------------------------------------------------------------------------

export function PipelineSnapshot({ customers }: { customers: TestCustomer[] }) {
  const counts: Record<CustomerStatus, number> = Object.fromEntries(
    CUSTOMER_STATUSES.map((s) => [s, 0]),
  ) as Record<CustomerStatus, number>;
  for (const c of customers) counts[c.status]++;
  const active = counts['Testklant actief'] + counts['Betaalde klant'];
  const inProgress =
    counts['Benaderd'] + counts['Gesprek gepland'] + counts['Demo gegeven'];
  const open = counts['Idee / mogelijke klant'] + counts['Nog benaderen'];

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 16,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
          }}
        >
          Testklanten pipeline
        </h2>
        <Link
          href="/commandcenter/customers"
          style={{
            fontSize: 12,
            color: 'var(--manta-accent, var(--accent))',
            textDecoration: 'none',
          }}
        >
          Open pipeline →
        </Link>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 10,
        }}
      >
        <SmallStat label="Actief / betalend" value={active} accent="var(--bd-success-fg)" />
        <SmallStat label="In gesprek" value={inProgress} />
        <SmallStat label="Open leads" value={open} />
        <SmallStat label="Afgewezen" value={counts['Afgewezen / later']} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {CUSTOMER_STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <span
            key={s}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
            }}
          >
            <CustomerStatusBadge status={s} />
            <span style={{ color: 'var(--fg-muted)' }}>{counts[s]}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function SmallStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-muted)',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
          fontSize: 20,
          fontWeight: 600,
          color: accent ?? 'var(--fg)',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}
