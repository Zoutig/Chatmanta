'use server';

// Document admin server actions — ingest (file upload), list, delete.
//
// Auth: relies on proxy.ts page-gate (V0 demo). Server actions zijn alleen
// vanuit ingelogde sessies bereikbaar via de UI; defense-in-depth zou een
// expliciete cookie check toevoegen — V0 accepteert proxy alleen.
//
// Limits: 200KB per upload (server-side enforced), .txt/.md extension only.
// Mutaties (ingest + delete) zijn rate-limited via checkMutationLimit —
// defense-in-depth tegen iemand met de v0-auth cookie die in een loop
// embeddings of deletes triggert. Lees zijn (refreshDocs) is bewust niet
// gelimiteerd: geen cost, geen mutatie.

import { revalidatePath } from 'next/cache';
import {
  deleteDoc,
  ingestText,
  listDocs,
  type DocSummary,
  type IngestResult,
} from '@/lib/v0/server/rag';
import { checkMutationLimit } from '@/lib/v0/server/rate-limit';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';
import { toAppError, type AppErrorCode } from '@/lib/errors/app-error';

const MAX_FILE_BYTES = 200 * 1024;
const ALLOWED_EXTS = new Set(['txt', 'md']);

// useActionState-shape — bewust tagged union ipv ActionResult zodat
// success/error verschillende data dragen (result vs code). De error-variant
// draagt nu een AppErrorCode zodat de UI userView() kan gebruiken.
export type IngestActionState =
  | { kind: 'idle' }
  | { kind: 'success'; result: IngestResult; filename: string }
  | { kind: 'error'; code: AppErrorCode; message: string };

export async function ingestAction(
  _prev: IngestActionState,
  formData: FormData,
): Promise<IngestActionState> {
  const limit = await checkMutationLimit();
  if (!limit.allowed) {
    return { kind: 'error', code: 'RATE_LIMIT', message: limit.message };
  }
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { kind: 'error', code: 'INGEST_READ_FAILED', message: 'Geen bestand geselecteerd.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      kind: 'error',
      code: 'INGEST_TOO_LARGE',
      message: `Bestand te groot (${(file.size / 1024).toFixed(1)} KB, max ${MAX_FILE_BYTES / 1024} KB).`,
    };
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTS.has(ext)) {
    return {
      kind: 'error',
      code: 'INGEST_TYPE',
      message: `Bestandstype .${ext} niet toegestaan (alleen .txt of .md).`,
    };
  }

  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    return {
      kind: 'error',
      code: 'INGEST_READ_FAILED',
      message: `Kon bestand niet lezen: ${err instanceof Error ? err.message : 'onbekend'}`,
    };
  }

  try {
    const result = await ingestText({ filename: file.name, text });
    revalidatePath('/');
    return { kind: 'success', result, filename: file.name };
  } catch (err) {
    const appErr = toAppError(err);
    return { kind: 'error', code: appErr.code, message: appErr.message };
  }
}

export async function removeDocAction(docId: string): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);
    await deleteDoc(docId);
    revalidatePath('/');
    return {};
  });
}

export async function refreshDocs(): Promise<DocSummary[]> {
  return listDocs();
}
