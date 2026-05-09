'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { ingestAction, removeDocAction, type IngestActionState } from '../actions/docs';
import type { DocSummary } from '@/lib/v0/server/rag';
import { Icon } from './svg-icons';

const initialState: IngestActionState = { kind: 'idle' };

export function DocsView({ docs }: { docs: DocSummary[] }) {
  const [state, action, pending] = useActionState(ingestAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.kind === 'success' && formRef.current) {
      formRef.current.reset();
    }
  }, [state]);

  const totalChunks = docs.reduce((a, d) => a + d.chunkCount, 0);

  return (
    <div>
      <form ref={formRef} action={action}>
        <div className="docs-actions">
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".txt,.md,text/plain,text/markdown"
            className="upload-input"
            onChange={() => formRef.current?.requestSubmit()}
          />
          <button
            type="button"
            className="btn-secondary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => inputRef.current?.click()}
            disabled={pending}
          >
            <Icon name="upload" size={12} /> {pending ? 'Bezig…' : 'Upload .txt / .md'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            title="Crawl website (komt in V1)"
            disabled
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
          >
            <Icon name="globe" size={12} />
          </button>
        </div>
      </form>

      {state.kind === 'success' ? (
        <div className="upload-status success">
          <strong>{state.filename}</strong> opgenomen — {state.result.chunks} chunks ·{' '}
          {state.result.embedTokens} embed-tokens · ${state.result.costUsd.toFixed(6)}
        </div>
      ) : null}
      {state.kind === 'error' ? (
        <div className="upload-status error">{state.message}</div>
      ) : null}

      <div className="settings-label" style={{ marginTop: 14 }}>
        <span>
          Geïndexeerd · {docs.length} {docs.length === 1 ? 'doc' : 'docs'}
        </span>
        <span style={{ color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
          {totalChunks} chunks
        </span>
      </div>
      {docs.length === 0 ? (
        <p className="right-empty">Nog geen documenten — upload .txt of .md hierboven.</p>
      ) : (
        docs.map((d) => <DocRow key={d.id} doc={d} />)
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: DocSummary }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const created = formatRelative(doc.createdAt);

  function onDelete() {
    if (!confirm(`Verwijder "${doc.filename}"? Chunks worden ook verwijderd.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeDocAction(doc.id);
      if (!res.ok) setError(res.error ?? 'verwijderen mislukt');
    });
  }

  const statusClass =
    doc.status === 'ready'
      ? 'ready'
      : doc.status === 'failed'
        ? 'failed'
        : 'indexing';

  return (
    <div className="doc-row">
      <div className="doc-icon">
        <Icon name="docs" size={13} />
      </div>
      <div className="doc-info">
        <div className="doc-name">{doc.filename}</div>
        <div className="doc-meta">
          {doc.chunkCount} chunks · {created}
          {error ? ` · ${error}` : ''}
        </div>
      </div>
      <span className={`doc-status ${statusClass}`}>{doc.status}</span>
      <button
        type="button"
        className="doc-delete"
        onClick={onDelete}
        disabled={pending}
        aria-label={`Verwijder ${doc.filename}`}
      >
        {pending ? '…' : 'Verwijder'}
      </button>
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'nu';
    if (diff < 3600) return `${Math.round(diff / 60)}m geleden`;
    if (diff < 86400) return `${Math.round(diff / 3600)}u geleden`;
    if (diff < 7 * 86400) return `${Math.round(diff / 86400)}d geleden`;
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
}
