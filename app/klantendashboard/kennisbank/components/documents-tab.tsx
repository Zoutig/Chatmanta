'use client';

import { useRef, useState } from 'react';
import {
  FileText,
  UploadCloud,
  Trash2,
  RefreshCw,
  File,
  FileType2,
} from 'lucide-react';
import { StatusBadge } from '../../components/status-badge';
import type { DocumentSummary, DocumentStatus } from '@/lib/v0/klantendashboard/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fileIconFor(type: DocumentSummary['type']) {
  if (type === 'pdf') return FileType2;
  if (type === 'docx') return FileText;
  return File;
}

export function DocumentsTab({ initialDocs }: { initialDocs: DocumentSummary[] }) {
  const [docs, setDocs] = useState<DocumentSummary[]>(initialDocs);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function ingestFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const newDocs: DocumentSummary[] = list.map((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      const type: DocumentSummary['type'] =
        ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'txt' ? 'txt' : 'other';
      return {
        id: `local-${Date.now()}-${f.name}`,
        name: f.name,
        type,
        size: f.size,
        status: 'processing',
        lastProcessedAt: new Date().toISOString(),
        chunkCount: 0,
      };
    });
    setDocs((d) => [...newDocs, ...d]);
    // Mock "verwerking" → ready na 1.5s.
    setTimeout(() => {
      setDocs((d) =>
        d.map((x) =>
          newDocs.find((n) => n.id === x.id)
            ? {
                ...x,
                status: 'ready' as DocumentStatus,
                lastProcessedAt: new Date().toISOString(),
                chunkCount: Math.max(1, Math.round(x.size / 1500)),
              }
            : x,
        ),
      );
    }, 1500);
  }

  function reprocess(id: string) {
    setDocs((d) =>
      d.map((x) => (x.id === id ? { ...x, status: 'processing' as DocumentStatus } : x)),
    );
    setTimeout(() => {
      setDocs((d) =>
        d.map((x) =>
          x.id === id
            ? {
                ...x,
                status: 'ready' as DocumentStatus,
                lastProcessedAt: new Date().toISOString(),
              }
            : x,
        ),
      );
    }, 1000);
  }

  function remove(id: string) {
    if (!confirm('Document verwijderen uit kennisbank?')) return;
    setDocs((d) => d.filter((x) => x.id !== id));
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Drop-zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) ingestFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        className="klant-card"
        style={{
          padding: 28,
          border: '2px dashed ' + (dragOver ? 'var(--klant-accent)' : 'var(--klant-border)'),
          background: dragOver ? 'var(--klant-accent-soft)' : 'var(--klant-surface)',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
        role="button"
        tabIndex={0}
        aria-label="Documenten uploaden"
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 999,
            background: 'var(--klant-accent-soft)',
            color: 'var(--klant-accent)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 10px',
          }}
        >
          <UploadCloud size={22} strokeWidth={1.7} />
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--klant-fg)',
            marginBottom: 4,
          }}
        >
          Sleep documenten hierheen of klik om te uploaden
        </div>
        <div style={{ fontSize: 13, color: 'var(--klant-fg-muted)' }}>
          Upload PDF, DOCX of TXT — denk aan prijslijsten, FAQ&apos;s, handleidingen of voorwaarden.
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) ingestFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Lijst */}
      {docs.length === 0 ? (
        <div className="klant-empty">
          <div className="klant-empty-icon">
            <FileText size={26} strokeWidth={1.6} />
          </div>
          <h3 className="klant-empty-title">Nog geen documenten</h3>
          <p className="klant-empty-sub">
            Upload je eerste document via het paneel hierboven. Je chatbot leest de content en
            kan vragen erover beantwoorden.
          </p>
        </div>
      ) : (
        <div className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Grootte</th>
                <th>Status</th>
                <th>Laatst verwerkt</th>
                <th style={{ textAlign: 'right' }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const FIcon = fileIconFor(d.type);
                return (
                  <tr key={d.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 'var(--klant-r-sm)',
                            background: 'var(--klant-surface)',
                            color: 'var(--klant-fg-muted)',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <FIcon size={15} strokeWidth={1.7} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              color: 'var(--klant-fg)',
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {d.name}
                          </div>
                          {d.chunkCount > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--klant-fg-dim)' }}>
                              {d.chunkCount} stukjes in kennisbank
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--klant-fg-muted)' }}>{formatBytes(d.size)}</td>
                    <td>
                      <StatusBadge status={d.status} kind="document" />
                    </td>
                    <td style={{ color: 'var(--klant-fg-muted)' }}>{formatDate(d.lastProcessedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => reprocess(d.id)}
                          className="klant-btn"
                          data-variant="ghost"
                          title="Opnieuw verwerken"
                          style={{ padding: 6 }}
                        >
                          <RefreshCw size={14} strokeWidth={1.7} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(d.id)}
                          className="klant-btn"
                          data-variant="danger"
                          title="Verwijderen"
                          style={{ padding: 6 }}
                        >
                          <Trash2 size={14} strokeWidth={1.7} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
