'use client';

import { useState, useTransition } from 'react';
import { removeDocAction } from '../actions/docs';
import type { DocSummary } from '@/lib/v0/server/rag';

export function DocList({ docs }: { docs: DocSummary[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="flex items-baseline gap-2 text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Geïndexeerde documenten
        <span className="font-mono text-zinc-700 dark:text-zinc-300">{docs.length}</span>
      </h2>
      {docs.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Nog geen documenten. Upload links om te beginnen.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
          {docs.map((d) => (
            <DocRow key={d.id} doc={d} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: DocSummary }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`Verwijder "${doc.filename}"? Chunks worden ook verwijderd.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeDocAction(doc.id);
      if (!res.ok) setError(res.error ?? 'verwijderen mislukt');
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-xs">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{doc.filename}</p>
        <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
          {doc.chunkCount} chunks · {doc.status}
          {error ? ` · ${error}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-500 opacity-60 transition hover:border-red-400 hover:text-red-600 hover:opacity-100 disabled:opacity-30 dark:border-zinc-800 dark:text-zinc-500 dark:hover:border-red-700 dark:hover:text-red-400"
      >
        {pending ? '…' : 'Verwijder'}
      </button>
    </li>
  );
}
