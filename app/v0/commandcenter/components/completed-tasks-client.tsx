'use client';

// CompletedTasksClient — voltooide-taken tab. Hero met Sebastiaan- en
// Niels-counter (samen + nog-toe-te-wijzen apart als kleinere stats),
// gegroepeerde lijst per maand op completedAt desc, client-side filter.

import { useMemo, useState } from 'react';
import { OWNERS, type Owner, type Task } from '@/lib/commandcenter/types';
import { Icon } from '@/app/components/svg-icons';
import { LabelChip, OwnerBadge } from './badges';

type OwnerFilter = 'all' | Owner;

const MONTH_LABELS_NL = [
  'jan',
  'feb',
  'mrt',
  'apr',
  'mei',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'dec',
];

function formatCompletedDate(iso: string): string {
  // ISO timestamp (UTC) → "18 mei 2026"
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_LABELS_NL[d.getMonth()]} ${d.getFullYear()}`;
}

function monthKey(iso: string): string {
  // "2026-05" voor groepering
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  // "2026-05" → "2026 — mei"
  const [year, mm] = key.split('-');
  return `${year} — ${MONTH_LABELS_NL[Number(mm) - 1]}`;
}

export function CompletedTasksClient({ tasks }: { tasks: Task[] }) {
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [search, setSearch] = useState('');

  const completed = useMemo(() => tasks.filter((t) => t.status === 'Klaar'), [tasks]);

  // Counters — telling per owner over ALLE voltooide taken (niet gefilterd).
  const counts = useMemo(() => {
    const result: Record<Owner, number> = {
      Sebastiaan: 0,
      Niels: 0,
      Samen: 0,
      'Nog toe te wijzen': 0,
    };
    for (const t of completed) result[t.owner]++;
    return result;
  }, [completed]);

  const filtered = useMemo(() => {
    let res = completed;
    if (ownerFilter !== 'all') res = res.filter((t) => t.owner === ownerFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      res = res.filter((t) =>
        [t.title, t.description ?? '', t.projectArea, ...t.labels]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    // Sortering: completedAt desc (recent eerst). Taken zonder completedAt achteraan.
    return [...res].sort((a, b) => {
      const da = a.completedAt ?? '0000-00-00';
      const db = b.completedAt ?? '0000-00-00';
      if (da !== db) return da < db ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
  }, [completed, ownerFilter, search]);

  const grouped = useMemo(() => {
    // Map<monthKey, Task[]>; "onbekend" voor taken zonder completedAt.
    const map = new Map<string, Task[]>();
    for (const t of filtered) {
      const key = t.completedAt ? monthKey(t.completedAt) : 'onbekend';
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            letterSpacing: '-0.02em',
            color: 'var(--fg)',
          }}
        >
          Voltooide taken
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--fg-muted)' }}>
          Iedere afgeronde taak en wie hem afmaakte. Totaal: {completed.length}{' '}
          {completed.length === 1 ? 'taak' : 'taken'}.
        </p>
      </header>

      {/* Hero counter: Sebastiaan vs Niels */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        <HeroStat label="Sebastiaan" value={counts.Sebastiaan} owner="Sebastiaan" />
        <HeroStat label="Niels" value={counts.Niels} owner="Niels" />
      </div>

      {/* Subtle mini-stats: Samen + Nog toe te wijzen */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
        }}
      >
        <MiniStat label="Samen" value={counts.Samen} />
        <MiniStat label="Nog toe te wijzen" value={counts['Nog toe te wijzen']} />
        <MiniStat label="Totaal" value={completed.length} highlight />
      </div>

      {/* Filter controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          padding: '14px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip
            label="Alles"
            active={ownerFilter === 'all'}
            onClick={() => setOwnerFilter('all')}
          />
          {OWNERS.map((o) => (
            <FilterChip
              key={o}
              label={o}
              active={ownerFilter === o}
              onClick={() => setOwnerFilter(o)}
            />
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--fg-muted)',
              display: 'inline-flex',
              pointerEvents: 'none',
            }}
          >
            <Icon name="search" size={14} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op titel of label…"
            style={{
              background: 'var(--bg-elev)',
              border: '1px solid var(--border-strong)',
              borderRadius: 999,
              padding: '6px 12px 6px 30px',
              fontSize: 13,
              color: 'var(--fg)',
              minWidth: 220,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Resultaten */}
      {filtered.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            color: 'var(--fg-muted)',
            fontStyle: 'italic',
            padding: '24px 0',
            textAlign: 'center',
          }}
        >
          Geen voltooide taken die matchen.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(([key, items]) => (
            <section key={key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.10em',
                  color: 'var(--fg-muted)',
                  fontWeight: 500,
                }}
              >
                {key === 'onbekend' ? 'Datum onbekend' : monthLabel(key)} ·{' '}
                {items.length} {items.length === 1 ? 'taak' : 'taken'}
              </h3>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {items.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '10px 14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <OwnerBadge owner={t.owner} />
                    <span
                      style={{
                        fontSize: 13.5,
                        color: 'var(--fg)',
                        flex: '1 1 240px',
                        minWidth: 0,
                      }}
                    >
                      {t.title}
                    </span>
                    {t.labels.length > 0 && (
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                        {t.labels.slice(0, 2).map((l) => (
                          <LabelChip key={l} label={l} />
                        ))}
                        {t.labels.length > 2 && (
                          <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                            +{t.labels.length - 2}
                          </span>
                        )}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11.5,
                        color: 'var(--fg-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {t.projectArea}
                    </span>
                    {t.completedAt && (
                      <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
                        {formatCompletedDate(t.completedAt)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HeroStat({
  label,
  value,
  owner,
}: {
  label: string;
  value: number;
  owner: Owner;
}) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 18,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <OwnerBadge owner={owner} />
        <span
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            color: 'var(--fg-muted)',
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            fontSize: 44,
            fontWeight: 700,
            color: 'var(--fg)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
          {value === 1 ? 'voltooide taak' : 'voltooide taken'}
        </span>
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: highlight ? '1px solid var(--border-bright)' : '1px solid var(--border)',
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
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
          fontSize: 22,
          fontWeight: 600,
          color: 'var(--fg)',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
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
          : 'var(--surface)',
        border: active
          ? '1px solid color-mix(in oklab, var(--manta-accent) 38%, transparent)'
          : '1px solid var(--border-strong)',
        color: active ? 'var(--manta-accent, var(--accent))' : 'var(--fg)',
        padding: '5px 11px',
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
