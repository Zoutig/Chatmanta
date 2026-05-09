'use client';

import { useActionState, useRef, useEffect } from 'react';
import { ingestAction, type IngestActionState } from '../actions/docs';

const initial: IngestActionState = { kind: 'idle' };

export function IngestForm() {
  const [state, action, pending] = useActionState(ingestAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset file input after a successful upload so the same file can be picked
  // again or a new one chosen.
  useEffect(() => {
    if (state.kind === 'success' && formRef.current) {
      formRef.current.reset();
    }
  }, [state]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Document toevoegen
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        .txt of .md, max 200 KB. Wordt direct gechunked + geëmbed.
      </p>
      <form ref={formRef} action={action} className="mt-3 flex flex-col gap-3">
        <input
          type="file"
          name="file"
          accept=".txt,.md,text/plain,text/markdown"
          required
          className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-800 dark:text-zinc-300 dark:file:bg-zinc-50 dark:file:text-zinc-900 dark:hover:file:bg-zinc-200"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? 'Bezig…' : 'Uploaden + indexeren'}
        </button>
      </form>
      <Status state={state} />
    </div>
  );
}

function Status({ state }: { state: IngestActionState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'error') {
    return (
      <p className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        {state.message}
      </p>
    );
  }
  const { result, filename } = state;
  return (
    <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      ✓ <strong>{filename}</strong> opgenomen — {result.chunks} chunks,{' '}
      {result.embedTokens} embed tokens, ${result.costUsd.toFixed(6)}.
    </p>
  );
}
