'use client';

// Documenten-tab: lijst met geüploade documenten (status, stukjes, datum),
// inhoud bekijken (zijpaneel) en verwijderen. Het uploaden zelf (knop,
// slepen-en-neerzetten op de hele pagina) zit in kennisbank-view.tsx.

import { useCallback, useState, useTransition, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, File, FileText, FileType2, Trash2, X } from 'lucide-react';
import { Badge, EmptyState, type Tone } from '@/app/v1/_ui/feedback';
import { Button } from '@/app/v1/_ui/button';
import { List, ListRow } from '@/app/v1/_ui/list';
import { useToast } from '@/app/v1/_ui/toast';
import { deleteDocumentAction, getDocContentAction } from './actions';
import { ConfirmDialog } from './components/confirm-dialog';
import { SourceDrawer, type SourceView } from './components/source-drawer';

export type UploadedDoc = { id: string; filename: string; status: string; createdAt: string; chunkCount: number };
/** Een bestand dat niet geüpload kon worden; blijft als rij staan tot je hem wegklikt. */
export type FailedUpload = { id: string; filename: string; error: string };

export const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}


function docStatus(s: string): { label: string; tone: Tone } {
  if (s === 'ready' || s === 'completed') return { label: 'Verwerkt', tone: 'ok' };
  if (s === 'failed' || s === 'error') return { label: 'Fout', tone: 'danger' };
  return { label: 'Wordt verwerkt', tone: 'accent' };
}

function FileIcon({ filename }: { filename: string }) {
  const ext = extOf(filename);
  return (
    <span className="v1-kb-file-icon" aria-hidden="true">
      {ext === 'pdf' ? (
        <FileType2 size={16} strokeWidth={1.8} />
      ) : ext === 'docx' ? (
        <FileText size={16} strokeWidth={1.8} />
      ) : (
        <File size={16} strokeWidth={1.8} />
      )}
    </span>
  );
}

export function V1Documents({
  docs,
  setDocs,
  failures,
  onDismissFailure,
  onPickFiles,
  uploading,
}: {
  docs: UploadedDoc[];
  setDocs: Dispatch<SetStateAction<UploadedDoc[]>>;
  failures: FailedUpload[];
  onDismissFailure: (id: string) => void;
  onPickFiles: () => void;
  uploading: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<UploadedDoc | null>(null);

  // Bron bekijken
  const [viewing, setViewing] = useState<SourceView | null>(null);
  const [, startView] = useTransition();
  const closeView = useCallback(() => setViewing(null), []);
  const cancelDelete = useCallback(() => setConfirm(null), []);

  function viewDoc(d: UploadedDoc) {
    setViewing({ title: d.filename, text: '', loading: true });
    startView(async () => {
      const res = await getDocContentAction(d.id);
      if (res.ok) setViewing({ title: d.filename, text: res.text || '(leeg)', loading: false });
      else setViewing({ title: d.filename, text: `Kon de inhoud niet laden: ${res.error}`, loading: false });
    });
  }

  function removeDoc() {
    const d = confirm;
    setConfirm(null);
    if (!d) return;
    setDocs((list) => list.filter((x) => x.id !== d.id)); // optimistisch
    start(async () => {
      const res = await deleteDocumentAction(d.id);
      if (!res.ok) {
        toast.error(res.error);
        router.refresh(); // hersync als de optimistische verwijdering fout was
        return;
      }
      toast.success('Document verwijderd');
    });
  }

  const empty = docs.length === 0 && failures.length === 0;

  return (
    <>
      {empty ? (
        <div className="v1-card v1-kb-card-flush">
          <EmptyState action={<Button variant="secondary" size="sm" onClick={onPickFiles}>Toevoegen</Button>}>
            Nog geen documenten. Sleep een bestand op deze pagina of kies er een. PDF, DOCX, TXT of MD, tot 10 MB.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="v1-toolbar">
            <p className="v1-hint">
              Sleep bestanden op deze pagina om ze toe te voegen. PDF, DOCX, TXT of MD, tot 10 MB.
            </p>
            <div className="v1-toolbar-end">
              <Button variant="secondary" size="sm" onClick={onPickFiles} loading={uploading}>
                Bestand kiezen
              </Button>
            </div>
          </div>
          <div className="v1-card v1-kb-card-flush">
            <List label="Documenten">
              {failures.map((f) => (
                <ListRow
                  key={f.id}
                  title={
                    <span className="v1-kb-rowline">
                      <FileIcon filename={f.filename} />
                      <span title={f.filename}>{f.filename}</span>
                    </span>
                  }
                  wrap
                  meta={<span className="v1-kb-meta-error">{f.error}</span>}
                  end={
                    <>
                      <Badge tone="danger">Mislukt</Badge>
                      <button type="button" className="v1-menu-btn" onClick={() => onDismissFailure(f.id)}
                        aria-label={`Melding over ${f.filename} sluiten`} title="Sluiten">
                        <X size={16} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    </>
                  }
                />
              ))}
              {docs.map((d) => {
                const isUploading = d.id.startsWith('uploading-');
                const st = isUploading ? { label: 'Uploaden', tone: 'accent' as Tone } : docStatus(d.status);
                const meta = [d.chunkCount > 0 ? `${d.chunkCount} stukjes` : null, formatDate(d.createdAt)]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <ListRow
                    key={d.id}
                    title={
                      <span className="v1-kb-rowline">
                        <FileIcon filename={d.filename} />
                        <span className="v1-list-title" title={d.filename}>{d.filename}</span>
                      </span>
                    }
                    meta={meta || undefined}
                    end={
                      <>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <button type="button" className="v1-menu-btn v1-kb-iconbtn" onClick={() => viewDoc(d)}
                          disabled={isUploading} aria-label={`Inhoud bekijken: ${d.filename}`} title="Inhoud bekijken">
                          <Eye size={16} strokeWidth={1.8} aria-hidden="true" />
                        </button>
                        <button type="button" className="v1-menu-btn v1-kb-iconbtn v1-kb-iconbtn--danger"
                          onClick={() => setConfirm(d)} disabled={isUploading || pending}
                          aria-label={`Verwijderen: ${d.filename}`} title="Verwijderen">
                          <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                        </button>
                      </>
                    }
                  />
                );
              })}
            </List>
          </div>
        </>
      )}

      {confirm ? (
        <ConfirmDialog
          title="Document verwijderen?"
          body={`"${confirm.filename}" gaat uit je kennisbank. Je chatbot gebruikt het daarna niet meer.`}
          confirmLabel="Verwijderen"
          onCancel={cancelDelete}
          onConfirm={removeDoc}
        />
      ) : null}
      {viewing ? <SourceDrawer view={viewing} onClose={closeView} /> : null}
    </>
  );
}
