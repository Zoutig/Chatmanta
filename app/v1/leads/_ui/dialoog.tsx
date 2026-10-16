'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function Dialoog({
  open,
  titel,
  onSluit,
  children,
  voet,
}: {
  open: boolean;
  titel: string;
  onSluit: () => void;
  children: ReactNode;
  voet?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="ld-dialoog" onClose={onSluit} onCancel={onSluit}>
      {open ? (
        <div className="ld-dialoog-inhoud">
          <h2>{titel}</h2>
          {children}
          {voet ? <div className="ld-dialoog-voet">{voet}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function Chips<T extends string>({
  opties,
  waarde,
  onKies,
  label,
}: {
  opties: ReadonlyArray<{ id: T; label: string }>;
  waarde: T | null;
  onKies: (id: T | null) => void;
  label: string;
}) {
  return (
    <div className="ld-chips" role="group" aria-label={label}>
      {opties.map((o) => (
        <button
          key={o.id}
          type="button"
          className="ld-chip"
          aria-pressed={waarde === o.id}
          onClick={() => onKies(waarde === o.id ? null : o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
