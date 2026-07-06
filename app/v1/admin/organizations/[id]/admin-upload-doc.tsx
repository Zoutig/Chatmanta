'use client';

// WP5c — upload-namens-klant (admin onboarding). Zelfde signed-URL-flow als de klant-
// Kennisbank (Vercel-body-cap-bypass): adminCreateUploadUrlAction → uploadToSignedUrl →
// adminProcessUploadedDocAction. Minimaal: alleen de drop-zone + resultaat-melding; de
// bronnenlijst hierboven (BronnenTab) en de klant-Kennisbank tonen de docs zelf.

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { ALLOWED_DOC_EXT } from '@/lib/rag/doc-ext';
import { adminCreateUploadUrlAction, adminProcessUploadedDocAction } from './actions';

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const ACCEPT = ALLOWED_DOC_EXT.map((e) => `.${e}`).join(',');
const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

type Feedback = { ok: boolean; text: string };

export function AdminUploadDoc({ orgId, chatbotId }: { orgId: string; chatbotId: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, start] = useTransition();

  const disabled = chatbotId === null;

  function onPick(file: File) {
    setFeedback(null);
    // Client-side pre-check (UX) — de server blijft autoritatief.
    if (!(ALLOWED_DOC_EXT as readonly string[]).includes(extOf(file.name))) {
      setFeedback({ ok: false, text: 'Alleen PDF, DOCX, TXT of MD worden ondersteund.' });
      return;
    }
    if (file.size === 0) { setFeedback({ ok: false, text: 'Leeg bestand.' }); return; }
    if (file.size > MAX_DOC_BYTES) { setFeedback({ ok: false, text: 'Bestand te groot (max 10 MB).' }); return; }

    start(async () => {
      const urlRes = await adminCreateUploadUrlAction(orgId, file.name, file.size);
      if (!urlRes.ok) { setFeedback({ ok: false, text: urlRes.error }); return; }
      const supabase = createClient();
      const up = await supabase.storage.from('v1-documents').uploadToSignedUrl(urlRes.path, urlRes.token, file);
      if (up.error) { setFeedback({ ok: false, text: `Upload mislukt: ${up.error.message}` }); return; }
      const proc = await adminProcessUploadedDocAction(orgId, urlRes.path, file.name);
      if (!proc.ok) { setFeedback({ ok: false, text: proc.error }); return; }
      setFeedback({ ok: true, text: `"${file.name}" toegevoegd — ${proc.chunks} stukjes in de kennisbank.` });
      router.refresh();
    });
  }

  function ingest(files: FileList | File[]) {
    Array.from(files).forEach(onPick);
  }

  if (disabled) {
    return (
      <p style={{ fontSize: 13, color: 'var(--klant-muted)', margin: 0 }}>
        Deze organisatie heeft nog geen chatbot — voer eerst een crawl of ingest uit voordat je documenten namens de klant kunt uploaden.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!pending) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!pending && e.dataTransfer.files.length > 0) ingest(e.dataTransfer.files); }}
        onClick={() => { if (!pending) fileRef.current?.click(); }}
        role="button"
        tabIndex={0}
        aria-label="Document uploaden namens de klant"
        onKeyDown={(e) => { if (!pending && (e.key === 'Enter' || e.key === ' ')) fileRef.current?.click(); }}
        style={{
          padding: 20,
          border: '2px dashed ' + (dragOver ? 'var(--klant-accent)' : 'var(--klant-border)'),
          borderRadius: 'var(--klant-r-md)',
          background: dragOver ? 'var(--klant-accent-soft)' : 'var(--klant-surface)',
          textAlign: 'center',
          cursor: pending ? 'progress' : 'pointer',
          opacity: pending ? 0.7 : 1,
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
      >
        <UploadCloud size={20} strokeWidth={1.7} style={{ color: 'var(--klant-accent)', marginBottom: 6 }} />
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--klant-ink)' }}>
          {pending ? 'Bezig met verwerken…' : 'Sleep een document hierheen of klik om te uploaden'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--klant-muted)', marginTop: 2 }}>
          PDF, DOCX, TXT of MD — max 10 MB. Wordt direct aan de kennisbank van deze klant toegevoegd.
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          disabled={pending}
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files) ingest(e.target.files); e.target.value = ''; }}
        />
      </div>
      {feedback && (
        <span
          role={feedback.ok ? 'status' : 'alert'}
          style={{ fontSize: 13, color: feedback.ok ? 'var(--klant-success)' : 'var(--klant-danger)' }}
        >
          {feedback.text}
        </span>
      )}
    </div>
  );
}
