'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button } from './button';
import { Panel } from './panel';

// "Eerst lezen, dan Wijzigen": een paneel toont waarden als tekst; Wijzigen zet
// alléén dat paneel om in een formulier met Opslaan/Annuleren. De draft wordt
// bij elke start vers uit de huidige waarden gevuld, zodat een eerdere save in
// een ander paneel nooit met verouderde invoer wordt overschreven.

export type SaveResult = { ok: true } | { ok: false; error: string };

export type Editable<T> = {
  editing: boolean;
  draft: T;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  start: () => void;
  cancel: () => void;
  submit: (e: FormEvent) => void;
  pending: boolean;
  error: string | null;
  justSaved: boolean;
};

export function useEditable<T>({
  current,
  save,
}: {
  /** Waarden zoals ze nu opgeslagen zijn; bron voor de draft bij Wijzigen. */
  current: () => T;
  save: (draft: T) => Promise<SaveResult>;
}): Editable<T> {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(current);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  return {
    editing,
    draft,
    set: (key, value) => setDraft((d) => ({ ...d, [key]: value })),
    start: () => {
      setDraft(current());
      setError(null);
      setJustSaved(false);
      setEditing(true);
    },
    cancel: () => {
      setError(null);
      setEditing(false);
    },
    submit: (e) => {
      e.preventDefault();
      setError(null);
      startTransition(async () => {
        let res: SaveResult;
        try {
          res = await save(draft);
        } catch {
          res = { ok: false, error: 'Opslaan is niet gelukt. Probeer het opnieuw.' };
        }
        if (res.ok) {
          setEditing(false);
          setJustSaved(true);
        } else {
          setError(res.error);
        }
      });
    },
    pending,
    error,
    justSaved,
  };
}

/** Formulier van de bewerkmodus (gedeeld door paneel en rij). */
function EditForm<T>({ edit, children }: { edit: Editable<T>; children: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select, [role=radio][aria-checked=true], [role=switch]')
      ?.focus();
  }, []);
  return (
    <form
      ref={formRef}
      className="v1-edit"
      onSubmit={edit.submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !edit.pending) {
          e.stopPropagation();
          edit.cancel();
        }
      }}
    >
      {children}
      {edit.error ? (
        <p className="v1-alert v1-alert--error" role="alert">
          {edit.error}
        </p>
      ) : null}
      <div className="v1-edit-actions">
        <Button type="submit" size="sm" loading={edit.pending}>
          Opslaan
        </Button>
        <Button variant="ghost" size="sm" onClick={edit.cancel} disabled={edit.pending}>
          Annuleren
        </Button>
      </div>
    </form>
  );
}

/** Wijzigen-knop + "Opgeslagen"; zet de focus terug op de knop na sluiten. */
function EditTrigger<T>({ edit, canEdit }: { edit: Editable<T>; canEdit: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(edit.editing);
  useEffect(() => {
    if (wasEditing.current && !edit.editing) btnRef.current?.focus();
    wasEditing.current = edit.editing;
  }, [edit.editing]);
  return (
    <>
      {edit.justSaved ? (
        <span className="v1-saved" role="status">
          <Check size={14} strokeWidth={2.2} aria-hidden="true" />
          Opgeslagen
        </span>
      ) : null}
      {canEdit ? (
        <Button ref={btnRef} variant="secondary" size="sm" onClick={edit.start}>
          Wijzigen
        </Button>
      ) : null}
    </>
  );
}

export function EditablePanel<T>({
  id,
  title,
  edit,
  canEdit = true,
  view,
  children,
}: {
  id?: string;
  title: string;
  edit: Editable<T>;
  /** Uit: geen Wijzigen-knop. */
  canEdit?: boolean;
  /** Leesweergave. */
  view: ReactNode;
  /** Velden in de bewerkmodus. */
  children: ReactNode;
}) {
  return (
    <Panel id={id} title={title} meta={edit.editing ? null : <EditTrigger edit={edit} canEdit={canEdit} />}>
      {edit.editing ? <EditForm edit={edit}>{children}</EditForm> : view}
    </Panel>
  );
}

/** Eén lees-rij die zelf in bewerkmodus kan (Account: e-mail, wachtwoord, naam). */
export function EditableRow<T>({
  label,
  edit,
  canEdit = true,
  view,
  children,
}: {
  label: string;
  edit: Editable<T>;
  canEdit?: boolean;
  view: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="v1-row">
      <dt className="v1-row-label">{label}</dt>
      {edit.editing ? (
        <dd className="v1-row-value v1-row-value--edit">
          <EditForm edit={edit}>{children}</EditForm>
        </dd>
      ) : (
        <>
          <dd className="v1-row-value">{view}</dd>
          <div className="v1-row-action">
            <EditTrigger edit={edit} canEdit={canEdit} />
          </div>
        </>
      )}
    </div>
  );
}
