'use client';

// V1 Kennisbank — document-upload-UI met V0-parity:
// drag-drop zone, bestandstype-iconen, chunk-count, bronnen-viewer (oog), verwijder-knop.
// Upload-flow is onveranderd (createUploadUrlAction/processUploadedDocAction via signed URL).

import { useRef, useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, UploadCloud, Trash2, File, FileType2, Eye,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { ALLOWED_DOC_EXT } from '@/lib/rag/doc-ext';
import { StatusBadge } from '@/app/klantendashboard/components/status-badge';
import { SourceViewer } from '@/app/klantendashboard/kennisbank/components/source-viewer';
import { createUploadUrlAction, processUploadedDocAction, deleteDocumentAction, getDocContentAction } from './actions';

export type UploadedDoc = { id: string; filename: string; status: string; createdAt: string; chunkCount: number };

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const ACCEPT = ALLOWED_DOC_EXT.map((e) => `.${e}`).join(',');
const ellipsis: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fileIconFor(filename: string) {
  const ext = extOf(filename);
  if (ext === 'pdf') return FileType2;
  if (ext === 'docx') return FileText;
  return File;
}

function docStatusLabel(s: string): 'ready' | 'processing' | 'error' {
  if (s === 'ready' || s === 'completed') return 'ready';
  if (s === 'failed' || s === 'error') return 'error';
  return 'processing';
}

export function V1Documents({ initialDocs }: { initialDocs: UploadedDoc[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>(initialDocs);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Bronnen-viewer
  const [viewing, setViewing] = useState<{ title: string; text: string } | null>(null);
  const [viewBusyId, setViewBusyId] = useState<string | null>(null);
  const [, startView] = useTransition();

  function viewDoc(d: UploadedDoc) {
    setViewBusyId(d.id);
    setViewing({ title: d.filename, text: '' });
    startView(async () => {
      const res = await getDocContentAction(d.id);
      setViewBusyId(null);
      if (res.ok) setViewing({ title: d.filename, text: res.text || '(leeg)' });
      else setViewing({ title: d.filename, text: `Kon de inhoud niet laden: ${res.error}` });
    });
  }

  function onPick(file: File) {
    setError(null);
    // Client-side pre-check (UX) — server blijft autoritatief.
    if (!(ALLOWED_DOC_EXT as readonly string[]).includes(extOf(file.name))) {
      setError('Alleen PDF, DOCX, TXT of MD worden ondersteund.');
      return;
    }
    if (file.size === 0) { setError('Leeg bestand.'); return; }
    if (file.size > MAX_DOC_BYTES) { setError('Bestand te groot (max 10 MB).'); return; }

    // Optimistisch rij toevoegen terwijl de upload bezig is.
    const tempId = `uploading-${Date.now()}-${file.name}`;
    const tempDoc: UploadedDoc = { id: tempId, filename: file.name, status: 'processing', createdAt: new Date().toISOString(), chunkCount: 0 };
    setDocs((d) => [tempDoc, ...d]);

    start(async () => {
      const urlRes = await createUploadUrlAction(file.name, file.size);
      if (!urlRes.ok) { setError(urlRes.error); setDocs((d) => d.filter((x) => x.id !== tempId)); return; }
      const supabase = createClient();
      const up = await supabase.storage.from('v1-documents').uploadToSignedUrl(urlRes.path, urlRes.token, file);
      if (up.error) { setError(`Upload mislukt: ${up.error.message}`); setDocs((d) => d.filter((x) => x.id !== tempId)); return; }
      const proc = await processUploadedDocAction(urlRes.path, file.name);
      if (!proc.ok) { setError(proc.error); setDocs((d) => d.filter((x) => x.id !== tempId)); return; }
      // Vervang de temp-rij door de definitieve (met chunk-count + server-id).
      setDocs((d) => d.map((x) => x.id === tempId
        ? { id: proc.documentId, filename: file.name, status: 'ready', createdAt: new Date().toISOString(), chunkCount: proc.chunks }
        : x,
      ));
      router.refresh();
    });
  }

  function removeDoc(id: string) {
    if (!confirm('Document verwijderen uit kennisbank?')) return;
    setDocs((d) => d.filter((x) => x.id !== id)); // optimistisch
    start(async () => {
      const res = await deleteDocumentAction(id);
      if (!res.ok) {
        setError(res.error);
        router.refresh(); // hersync als de optimistische verwijdering fout was
      }
    });
  }

  function ingestFiles(files: FileList | File[]) {
    Array.from(files).forEach(onPick);
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Drop-zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) ingestFiles(e.dataTransfer.files); }}
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
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 999, background: 'var(--klant-accent-soft)', color: 'var(--klant-accent)', display: 'grid', placeItems: 'center', margin: '0 auto 10px' }}>
          <UploadCloud size={22} strokeWidth={1.7} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--klant-fg)', marginBottom: 4 }}>
          Sleep documenten hierheen of klik om te uploaden
        </div>
        <div style={{ fontSize: 13, color: 'var(--klant-fg-muted)' }}>
          Upload PDF, DOCX of TXT — denk aan prijslijsten, FAQ&apos;s, handleidingen of voorwaarden.
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          disabled={pending}
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files) ingestFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {error && <div style={{ color: 'var(--klant-danger)', fontSize: 13 }}>{error}</div>}

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
          <div className="table-scroll">
            <table className="klant-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Status</th>
                  <th>Toegevoegd</th>
                  <th style={{ textAlign: 'right' }}>Acties</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const FIcon = fileIconFor(d.filename);
                  const isUploading = d.id.startsWith('uploading-');
                  return (
                    <tr key={d.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 'var(--klant-r-sm)', background: 'var(--klant-surface)', color: 'var(--klant-fg-muted)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <FIcon size={15} strokeWidth={1.7} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div title={d.filename} style={{ color: 'var(--klant-fg)', fontWeight: 500, ...ellipsis }}>{d.filename}</div>
                            {d.chunkCount > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--klant-fg-dim)' }}>{d.chunkCount} stukjes in kennisbank</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={docStatusLabel(d.status)} kind="document" />
                      </td>
                      <td style={{ color: 'var(--klant-fg-muted)' }}>{formatDate(d.createdAt)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          {!isUploading && (
                            <button
                              type="button"
                              onClick={() => viewDoc(d)}
                              className="klant-btn"
                              data-variant="ghost"
                              title="Inhoud bekijken"
                              aria-label="Inhoud bekijken"
                              style={{ padding: 6 }}
                            >
                              <Eye size={14} strokeWidth={1.7} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeDoc(d.id)}
                            className="klant-btn"
                            data-variant="danger"
                            title="Verwijderen"
                            disabled={isUploading || pending}
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
        </div>
      )}

      <SourceViewer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        loading={viewBusyId !== null}
        title={viewing?.title ?? ''}
        text={viewing?.text ?? ''}
      />
    </section>
  );
}
