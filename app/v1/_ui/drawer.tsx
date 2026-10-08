'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Zijpaneel rechts (spec 7.3). Wordt geportaald naar de .v1-ui-root zodat het
// boven de zijbalk ligt maar de V1-tokens en het font houdt. Escape en klik op
// de achtergrond sluiten; focus gaat naar het paneel en blijft erin (Tab-lus).

export function Drawer({
  title,
  onClose,
  children,
  footer,
  headerExtra,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra knoppen in de kop, links van sluiten. */
  headerExtra?: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`v1-drawer-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.v1-ui') ?? document.body);
  }, []);

  useEffect(() => {
    if (!host) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      // Focus staat na openen op het paneel zelf: ook dan binnen de lus blijven.
      if (document.activeElement === panelRef.current) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [host, onClose]);

  if (!host) return null;
  return createPortal(
    <>
      <div className="v1-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} className="v1-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="v1-drawer-head">
          <h2 id={titleId} className="v1-drawer-title">
            {title}
          </h2>
          {headerExtra}
          <button type="button" className="v1-menu-btn" onClick={onClose} aria-label="Sluiten">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="v1-drawer-body">{children}</div>
        {footer ? <div className="v1-drawer-foot">{footer}</div> : null}
      </div>
    </>,
    host,
  );
}
