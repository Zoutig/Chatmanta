'use client';

import Link from 'next/link';
import type { KeyboardEvent } from 'react';

// Onderstreepte tabs. Twee vormen:
//  - LinkTabs: elke tab is een route/URL (navigatie, deelbaar).
//  - Tabs: tabs binnen één pagina (state), met pijltjestoetsen.

export type TabItem<T extends string = string> = { id: T; label: string; count?: number };

function Count({ n }: { n?: number }) {
  return n === undefined ? null : <span className="v1-tab-count">{n}</span>;
}

export function LinkTabs({
  items,
  active,
  label,
}: {
  items: ReadonlyArray<TabItem & { href: string }>;
  active: string;
  label: string;
}) {
  return (
    <nav className="v1-tabs" aria-label={label}>
      {items.map((t) => (
        <Link key={t.id} href={t.href} className="v1-tab" aria-current={t.id === active ? 'page' : undefined} scroll={false}>
          {t.label}
          <Count n={t.count} />
        </Link>
      ))}
    </nav>
  );
}

export function Tabs<T extends string>({
  items,
  active,
  onChange,
  label,
  idPrefix,
}: {
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  label: string;
  /** Prefix voor tab/panel-id's (aria-controls). */
  idPrefix: string;
}) {
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = items.findIndex((t) => t.id === active);
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
    onChange(next.id);
    document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
  }
  return (
    <div className="v1-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            id={`${idPrefix}-tab-${t.id}`}
            type="button"
            role="tab"
            className="v1-tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            <Count n={t.count} />
          </button>
        );
      })}
    </div>
  );
}
