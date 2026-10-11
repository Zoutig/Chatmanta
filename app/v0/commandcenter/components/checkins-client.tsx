'use client';

// CheckInsClient — overzicht van weekretros (goal-prompt §12.3).
// Lijst met expand-on-click; "Nieuwe check-in" knop opent modal.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CheckIn } from '@/lib/commandcenter/types';
import { Icon } from '@/app/components/svg-icons';
import { CheckInModal } from './checkin-modal';

type Props = {
  checkIns: CheckIn[];
};

export function CheckInsClient({ checkIns }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<CheckIn | null>(null);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setMode('create');
  }
  function openEdit(c: CheckIn) {
    setEditing(c);
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
              color: 'var(--fg)',
              backgroundClip: 'text',
            }}
          >
            Wekelijkse check-ins
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--fg-muted)' }}>
            Korte retro per week: wat afgerond, wat niet, en de 3 prioriteiten
            voor de week erna.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          style={{
            background: 'var(--manta-accent)',
            border: '1px solid color-mix(in oklab, var(--manta-accent) 50%, transparent)',
            color: 'var(--accent-fg)',
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
          Nieuwe check-in
        </button>
      </header>

      {checkIns.length === 0 && (
        <div
          style={{
            border: '1px dashed var(--border-strong)',
            borderRadius: 16,
            padding: 32,
            color: 'var(--fg-muted)',
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          Nog geen check-ins. Begin met &ldquo;Nieuwe check-in&rdquo; om de eerste
          week vast te leggen.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {checkIns.map((c) => {
          const expanded = expandedId === c.id;
          return (
            <article
              key={c.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 600,
                      fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                    }}
                  >
                    {c.weekLabel}
                  </h3>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: 12,
                      color: 'var(--fg-muted)',
                    }}
                  >
                    {c.date} · {c.attendees.length > 0 ? c.attendees.join(', ') : 'Geen aanwezigen'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--fg)',
                      padding: '6px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {expanded ? 'Inklappen' : 'Bekijken'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--fg)',
                      padding: '6px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name="edit" size={12} />
                    Bewerken
                  </button>
                </div>
              </div>

              {c.nextPriorities.length > 0 && !expanded && (
                <div
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  {c.nextPriorities.slice(0, 3).map((p, i) => (
                    <span
                      key={i}
                      style={{
                        background: 'var(--border)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontSize: 11.5,
                        color: 'var(--bd-info-fg)',
                      }}
                    >
                      {i + 1}. {p}
                    </span>
                  ))}
                </div>
              )}

              {expanded && (
                <div
                  style={{
                    marginTop: 14,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 14,
                    fontSize: 13,
                    color: 'var(--fg)',
                  }}
                >
                  <Section title="Afgerond" text={c.completed} />
                  <Section title="Niet gelukt" text={c.notCompleted} />
                  <Section title="Waarom niet" text={c.reasons} />
                  <Section title="Geblokkeerde punten" text={c.blockers} />
                  <Section title="Beslissingen" text={c.decisions} />
                  <BulletSection title="3 prioriteiten" items={c.nextPriorities} />
                  <BulletSection
                    title="Taken Sebastiaan"
                    items={c.sebastiaanNextTasks}
                  />
                  <BulletSection title="Taken Niels" items={c.nielsNextTasks} />
                  <BulletSection
                    title="Gezamenlijke taken"
                    items={c.sharedNextTasks}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>

      <CheckInModal
        key={editing?.id ?? 'new'}
        open={mode !== 'closed'}
        checkIn={editing}
        onClose={close}
        onSaved={onSaved}
      />
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h4
        style={{
          margin: 0,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-muted)',
          fontWeight: 500,
        }}
      >
        {title}
      </h4>
      <p
        style={{
          margin: '4px 0 0',
          whiteSpace: 'pre-wrap',
          color: text ? 'var(--fg)' : 'var(--fg-faint)',
        }}
      >
        {text || '—'}
      </p>
    </div>
  );
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4
        style={{
          margin: 0,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-muted)',
          fontWeight: 500,
        }}
      >
        {title}
      </h4>
      {items.length === 0 ? (
        <p style={{ margin: '4px 0 0', color: 'var(--fg-faint)' }}>—</p>
      ) : (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {items.map((x, i) => (
            <li key={i} style={{ marginBottom: 2 }}>
              {x}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
