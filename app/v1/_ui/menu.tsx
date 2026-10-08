'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';

// ⋯-overflowmenu (of met eigen trigger-inhoud). Sluit bij Escape en klik
// buiten; pijltjestoetsen lopen door de items.

export type MenuItem =
  | { label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean }
  | { label: string; icon?: ReactNode; href: string; download?: boolean };

export function Menu({
  label,
  items,
  trigger,
  triggerClassName = 'v1-menu-btn',
  align = 'end',
}: {
  /** Toegankelijk label van de knop, bv. "Meer acties". */
  label: string;
  items: MenuItem[];
  /** Eigen knopinhoud; standaard het ⋯-icoon. */
  trigger?: ReactNode;
  triggerClassName?: string;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('.v1-menu-item')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function onListKey(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('.v1-menu-item:not(:disabled)'));
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = els[(i + (e.key === 'ArrowDown' ? 1 : els.length - 1)) % els.length];
    next?.focus();
  }

  return (
    <div className="v1-menu" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={triggerClassName}
        aria-label={trigger ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger ?? <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />}
      </button>
      {open ? (
        <ul id={listId} className="v1-menu-list" role="menu" aria-label={label} data-align={align} onKeyDown={onListKey}>
          {items.map((it) => (
            <li key={it.label} role="none">
              {'href' in it ? (
                it.download ? (
                  <a role="menuitem" className="v1-menu-item" href={it.href} download onClick={() => setOpen(false)}>
                    {it.icon}
                    {it.label}
                  </a>
                ) : (
                  <Link role="menuitem" className="v1-menu-item" href={it.href} onClick={() => setOpen(false)}>
                    {it.icon}
                    {it.label}
                  </Link>
                )
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="v1-menu-item"
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onSelect();
                  }}
                >
                  {it.icon}
                  {it.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
