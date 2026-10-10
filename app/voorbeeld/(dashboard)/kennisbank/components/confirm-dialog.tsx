'use client';

// Kleine bevestigingsdialoog in V1-stijl (zelfde vorm als de dialoog op
// Instellingen). Vervangt window.confirm bij verwijderen.

import { useEffect, useId } from 'react';
import { Button } from '@/app/v1/_ui/button';

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="v1-dialog-backdrop" onClick={onCancel}>
      <div
        className="v1-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="v1-dialog-title">
          {title}
        </h2>
        {body ? <p className="v1-dialog-body">{body}</p> : null}
        <div className="v1-dialog-actions">
          <Button variant="ghost" onClick={onCancel} autoFocus>
            Annuleren
          </Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
