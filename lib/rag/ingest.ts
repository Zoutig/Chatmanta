import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { embedTexts } from './embeddings';
import { AppError } from '@/lib/errors/app-error';
import { chunkParentsAndChildren } from './chunker';

export type IngestInput = {
  organizationId: string; // verplicht, op elke rij
  chatbotId: string; // verplicht, op elke rij
  filename: string;
  text: string;
  source?: 'upload' | 'v0_local'; // default 'upload'
  metadata?: Record<string, unknown>;
};

export type IngestResult = {
  documentId: string;
  parents: number;
  chunks: number;
  embedTokens: number;
  costUsd: number;
};

/**
 * Neutrale, client-geïnjecteerde document-ingest voor V1: schrijft een document +
 * parent_chunks + child document_chunks (geëmbed), allemaal org+chatbot-gestempeld.
 * V0 blijft op z'n eigen flat ingestText draaien (deze functie raakt V0 niet).
 * Geen answer-cache-purge (V1 heeft geen answer_cache). Append-only.
 */
export async function ingestDocument(
  client: SupabaseClient,
  input: IngestInput,
): Promise<IngestResult> {
  const { organizationId, chatbotId, filename, text, source = 'upload', metadata } = input;
  const { parents, children } = chunkParentsAndChildren(text);
  if (children.length === 0) {
    throw new AppError('INGEST_READ_FAILED', { message: 'document is empty after trimming' });
  }

  const { data: doc, error: docErr } = await client
    .from('documents')
    .insert({
      organization_id: organizationId,
      chatbot_id: chatbotId,
      filename,
      source,
      status: 'processing',
      metadata: {
        chars: text.length,
        parent_count: parents.length,
        chunk_count: children.length,
        ...(metadata ?? {}),
      },
    })
    .select('id')
    .single();
  if (docErr) throw new Error(`document insert: ${docErr.message}`);
  const documentId = doc.id as string;

  let embed;
  try {
    embed = await embedTexts(children.map((c) => c.content));
  } catch (err) {
    await client.from('documents').update({ status: 'failed' }).eq('id', documentId);
    if (err instanceof AppError) throw err;
    throw new AppError('EMBED_FAILED', {
      message: err instanceof Error ? err.message : 'embed call failed',
      cause: err,
    });
  }

  const { data: insParents, error: pErr } = await client
    .from('parent_chunks')
    .insert(
      parents.map((content, parent_index) => ({
        organization_id: organizationId,
        chatbot_id: chatbotId,
        document_id: documentId,
        parent_index,
        content,
      })),
    )
    .select('id, parent_index');
  if (pErr) {
    await client.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw new Error(`parent_chunks insert: ${pErr.message}`);
  }
  const parentIdByIndex = new Map<number, string>(
    (insParents ?? []).map((p) => [p.parent_index as number, p.id as string]),
  );

  const childRows = children.map((c, i) => ({
    organization_id: organizationId,
    chatbot_id: chatbotId,
    document_id: documentId,
    content: c.content,
    embedding: embed.vectors[i],
    parent_chunk_id: parentIdByIndex.get(c.parentIndex) ?? null,
    metadata: { chunk_index: i, parent_index: c.parentIndex },
  }));
  const { error: cErr } = await client.from('document_chunks').insert(childRows);
  if (cErr) {
    await client.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw new Error(`document_chunks insert: ${cErr.message}`);
  }

  await client.from('documents').update({ status: 'ready' }).eq('id', documentId);

  return {
    documentId,
    parents: parents.length,
    chunks: children.length,
    embedTokens: embed.tokens,
    costUsd: embed.costUsd,
  };
}
