'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useHydrated } from '../../ui/use-hydrated';
import type { TierId } from '@/lib/site/pricing';

/**
 * Mobiele vergelijking (<760px): zonder JS staan de drie pakketlijsten onder elkaar
 * (Groei eerst); met JS worden het tabs met Groei voorgeselecteerd (mockup `ctTabs`).
 * De panelen zelf worden server-side gerenderd en als `panels` doorgegeven.
 */
export function CompareTabs({
  tabs,
  panels,
  initial,
}: {
  tabs: ReadonlyArray<{ id: TierId; name: string }>;
  panels: ReadonlyArray<{ id: TierId; node: ReactNode }>;
  initial: TierId;
}) {
  const enhanced = useHydrated();
  const [active, setActive] = useState<TierId>(initial);
  const barRef = useRef<HTMLDivElement>(null);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setActive(next.id);
    barRef.current?.querySelector<HTMLButtonElement>(`[data-t="${next.id}"]`)?.focus();
  };

  return (
    <div className={enhanced ? 'ct-tabs is-tabs' : 'ct-tabs'}>
      {enhanced ? (
        <div className="tabbar" role="tablist" aria-label="Kies pakket" ref={barRef} onKeyDown={onKey}>
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                data-t={t.id}
                aria-controls={`tp-${t.id}`}
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(t.id)}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      ) : null}
      {panels.map((p) => (
        <section
          key={p.id}
          className="tablist"
          id={`tp-${p.id}`}
          role={enhanced ? 'tabpanel' : undefined}
          aria-labelledby={enhanced ? `tab-${p.id}` : `tph-${p.id}`}
          hidden={enhanced && p.id !== active}
        >
          {p.node}
        </section>
      ))}
    </div>
  );
}
