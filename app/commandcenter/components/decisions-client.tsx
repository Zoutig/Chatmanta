'use client';

// DecisionsClient — beslissingenlog overzicht met status-filter.

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  DECISION_STATUSES,
  type Decision,
  type DecisionStatus,
} from '@/lib/commandcenter/types';
import { DecisionStatusBadge, OwnerBadge } from './badges';
import { DecisionModal } from './decision-modal';
import { Icon } from '@/app/components/svg-icons';

type Filter = DecisionStatus | 'Alles';
const FILTERS: Filter[] = ['Alles', ...DECISION_STATUSES];

type Props = {
  decisions: Decision[];
};

export function DecisionsClient({ decisions }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<Decision | null>(null);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [filter, setFilter] = useState<Filter>('Alles');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = decisions;
    if (filter !== 'Alles') list = list.filter((d) => d.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.decision.toLowerCase().includes(q) ||
          (d.context ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [decisions, filter, search]);

  function openCreate() {
    setEditing(null);
    setMode('create');
  }
  function openEdit(d: Decision) {
    setEditing(d);
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
            Beslissingen
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--fg-muted)' }}>
            Logboek van product-, scope- en organisatie-keuzes. Eén plek waar
            &ldquo;dat hadden we toch besloten?&rdquo; opgezocht kan worden.
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
          }}
        >
          <Icon name="plus" size={14} />
          Nieuwe beslissing
        </button>
      </header>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                background: active
                  ? 'color-mix(in oklab, var(--manta-accent) 16%, transparent)'
                  : 'transparent',
                border: active
                  ? '1px solid color-mix(in oklab, var(--manta-accent) 34%, transparent)'
                  : '1px solid var(--border-strong)',
                color: active ? 'var(--fg)' : 'var(--fg-muted)',
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {f}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <input
          type="search"
          placeholder="Zoeken…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 220,
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            borderRadius: 10,
            padding: '7px 12px',
            color: 'var(--fg)',
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>

      {filtered.length === 0 ? (
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
          Geen beslissingen die aan dit filter voldoen.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => openEdit(d)}
              style={{
                textAlign: 'left',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 16,
                cursor: 'pointer',
                color: 'var(--fg)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
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
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                  }}
                >
                  {d.title}
                </h3>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <DecisionStatusBadge status={d.status} />
                  {d.impact && (
                    <span
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--fg-muted)',
                        background: 'var(--surface-2)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: 999,
                        padding: '2px 8px',
                      }}
                    >
                      Impact: {d.impact}
                    </span>
                  )}
                </div>
              </div>
              {d.decision && (
                <p
                  style={{
                    margin: 0,
                    color: 'var(--fg)',
                    fontSize: 13.5,
                  }}
                >
                  {d.decision}
                </p>
              )}
              {d.context && (
                <p
                  style={{
                    margin: 0,
                    color: 'var(--fg-muted)',
                    fontSize: 12.5,
                    fontStyle: 'italic',
                  }}
                >
                  Waarom: {d.context}
                </p>
              )}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginTop: 2,
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                  {d.date}
                </span>
                <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>·</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {d.decidedBy.length === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
                      Niemand
                    </span>
                  ) : (
                    d.decidedBy.map((o) => <OwnerBadge key={o} owner={o} />)
                  )}
                </div>
                {d.reviewDate && (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>·</span>
                    <span style={{ fontSize: 12, color: '#f0d39a' }}>
                      Herzien {d.reviewDate}
                    </span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <DecisionModal
        key={editing?.id ?? 'new'}
        open={mode !== 'closed'}
        decision={editing}
        onClose={close}
        onSaved={onSaved}
      />
    </div>
  );
}
