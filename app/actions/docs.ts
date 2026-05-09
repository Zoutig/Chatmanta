'use server';

// Document admin server actions — ingest (file upload), list, delete.
//
// Auth: relies on proxy.ts page-gate (V0 demo). Server actions zijn alleen
// vanuit ingelogde sessies bereikbaar via de UI; defense-in-depth zou een
// expliciete cookie check toevoegen — V0 accepteert proxy alleen.
//
// Limits: 100KB per upload (server-side enforced), .txt/.md extension only.
// Geen rate limiting in V0 (Upstash komt in V1 Phase 6); password-gate is
// de primaire kostenbarriere.

import { revalidatePath } from 'next/cache';
import {
  deleteDoc,
  ingestText,
  listDocs,
  type DocSummary,
  type IngestResult,
} from '@/lib/v0/server/rag';

const MAX_FILE_BYTES = 100 * 1024;
const ALLOWED_EXTS = new Set(['txt', 'md']);

export type IngestActionState =
  | { kind: 'idle' }
  | { kind: 'success'; result: IngestResult; filename: string }
  | { kind: 'error'; message: string };

export async function ingestAction(
  _prev: IngestActionState,
  formData: FormData,
): Promise<IngestActionState> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { kind: 'error', message: 'Geen bestand geselecteerd.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      kind: 'error',
      message: `Bestand te groot (${(file.size / 1024).toFixed(1)} KB, max ${MAX_FILE_BYTES / 1024} KB).`,
    };
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTS.has(ext)) {
    return { kind: 'error', message: `Bestandstype .${ext} niet toegestaan (alleen .txt of .md).` };
  }

  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    return {
      kind: 'error',
      message: `Kon bestand niet lezen: ${err instanceof Error ? err.message : 'onbekend'}`,
    };
  }

  try {
    const result = await ingestText({ filename: file.name, text });
    revalidatePath('/');
    return { kind: 'success', result, filename: file.name };
  } catch (err) {
    return {
      kind: 'error',
      message: `Ingest gefaald: ${err instanceof Error ? err.message : 'onbekend'}`,
    };
  }
}

export async function removeDocAction(docId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await deleteDoc(docId);
    revalidatePath('/');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'onbekend' };
  }
}

export async function refreshDocs(): Promise<DocSummary[]> {
  return listDocs();
}
