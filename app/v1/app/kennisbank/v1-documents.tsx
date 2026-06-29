'use client';

// V1 Kennisbank — document-upload-UI (PDF/DOCX/TXT/MD ≤10MB) + read-only docs-lijst.
// Bewust minimaal + self-contained (inline styles, zoals v1-kennisbank.tsx): de
// V1-app-shell heeft nog geen dashboard-chrome. Het bestand gaat DIRECT naar Storage
// via een signed upload-URL (omzeilt de 4,5MB server-action-body-cap); de server
// genereert het pad + valideert ext/size/magic-bytes autoritatief.

import { useRef, useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/v1/client';
import { ALLOWED_DOC_EXT } from '@/lib/rag/doc-ext';
import { createUploadUrlAction, processUploadedDocAction } from './actions';

export type UploadedDoc = { id: string; filename: string; status: string; createdAt: string };

const card: CSSProperties = { border: '1px solid #e2e2e2', borderRadius: 10, padding: 14, background: '#fff' };
const btnPrimary: CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid #111', background: '#111', color: '#fff', cursor: 'pointer', fontSize: 13 };
const ellipsis: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const ACCEPT = ALLOWED_DOC_EXT.map((e) => `.${e}`).join(',');

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString('nl-NL'); } catch { return ''; } };
const statusLabel = (s: string) =>
  s === 'ready' ? 'Klaar' : s === 'processing' ? 'Bezig…' : s === 'failed' ? 'Mislukt' : s;

export function V1Documents({ initialDocs }: { initialDocs: UploadedDoc[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onPick(file: File) {
    setError(null);
    setNotice(null);
    // Client-side pre-check (UX) — de server blijft autoritatief.
    if (!(ALLOWED_DOC_EXT as readonly string[]).includes(extOf(file.name))) {
      setError('Alleen PDF, DOCX, TXT of MD worden ondersteund.');
      return;
    }
    if (file.size === 0) { setError('Leeg bestand.'); return; }
    if (file.size > MAX_DOC_BYTES) { setError('Bestand te groot (max 10 MB).'); return; }

    start(async () => {
      // 1. signed upload-URL (server genereert het pad + valideert ext/size).
      const urlRes = await createUploadUrlAction(file.name, file.size);
      if (!urlRes.ok) { setError(urlRes.error); return; }
      // 2. direct-to-Storage (token-geautoriseerd; omzeilt de 4,5MB action-cap).
      const supabase = createClient();
      const up = await supabase.storage
        .from('v1-documents')
        .uploadToSignedUrl(urlRes.path, urlRes.token, file, { contentType: file.type || 'application/octet-stream' });
      if (up.error) { setError(`Upload mislukt: ${up.error.message}`); return; }
      // 3. server verwerkt: download → magic-bytes → extract → ingest → opruimen.
      const proc = await processUploadedDocAction(urlRes.path, file.name);
      if (!proc.ok) { setError(proc.error); return; }
      setNotice(`"${file.name}" toegevoegd (${proc.chunks} chunks).`);
      router.refresh(); // herlaad de server-gerenderde docs-lijst
    });
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
          Upload een document (PDF, DOCX, TXT of MD, max 10 MB). De tekst wordt aan je chatbot toegevoegd; het
          originele bestand bewaren we niet.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          disabled={pending}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }}
          style={{ display: 'none' }}
        />
        <div>
          <button type="button" style={btnPrimary} disabled={pending} onClick={() => inputRef.current?.click()}>
            {pending ? 'Bezig met uploaden…' : '+ Document uploaden'}
          </button>
        </div>
        {error && <div style={{ color: '#c00', fontSize: 13 }}>{error}</div>}
        {notice && <div style={{ color: '#0a7d18', fontSize: 13 }}>{notice}</div>}
      </div>

      {initialDocs.length === 0 ? (
        <div style={{ ...card, fontSize: 13, color: '#777' }}>Nog geen documenten geüpload.</div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {initialDocs.map((d, i) => (
            <div
              key={d.id}
              style={{ display: 'flex', gap: 10, padding: '10px 14px', alignItems: 'center', fontSize: 13, borderTop: i === 0 ? 'none' : '1px solid #f4f4f4' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div title={d.filename} style={{ fontWeight: 600, ...ellipsis }}>{d.filename}</div>
                <div style={{ fontSize: 12, color: '#777' }}>{fmtDate(d.createdAt)}</div>
              </div>
              <span style={{ fontSize: 12, color: d.status === 'failed' ? '#c00' : '#777', flexShrink: 0 }}>
                {statusLabel(d.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
