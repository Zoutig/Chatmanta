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
  source?: 'upload' | 'v0_local' | 'website'; // default 'upload'
  /** Koppelt een gecrawlde pagina (source='website') aan z'n knowledge_sources-rij
   *  voor re-crawl-dedup + dashboard-groepering. Null/undefined voor uploads. */
  knowledgeSourceId?: string;
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
 * Cache-invalidatie is de verantwoordelijkheid van de caller (purgeAnswerCache,
 * één keer per ingest-operatie i.p.v. per pagina/chunk). Append-only schrijfpad.
 */
export async function ingestDocument(
  client: SupabaseClient,
  input: IngestInput,
): Promise<IngestResult> {
  const { organizationId, chatbotId, filename, text, source = 'upload', knowledgeSourceId, metadata } = input;
  const { parents, children } = chunkParentsAndChildren(text);
  if (children.length === 0) {
    throw new AppError('INGEST_READ_FAILED', { message: 'document is empty after trimming' });
  }

  const { data: doc, error: docErr } = await client
    .from('documents')
    .insert({
      organization_id: organizationId,
      chatbot_id: chatbotId,
      knowledge_source_id: knowledgeSourceId ?? null,
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

  const { error: readyErr } = await client.from('documents').update({ status: 'ready' }).eq('id', documentId);
  if (readyErr) {
    // ponytail: de chunks zijn op dit punt volledig geschreven + retrievebaar (de
    // match-RPC filtert op deleted_at, NIET op status) — een gefaalde status-flip is
    // cosmetisch. Warn i.p.v. falen, zodat een geslaagde ingest niet op cosmetica omvalt.
    console.warn(`[ingestDocument] status→ready faalde voor ${documentId}: ${readyErr.message}`);
  }

  return {
    documentId,
    parents: parents.length,
    chunks: children.length,
    embedTokens: embed.tokens,
    costUsd: embed.costUsd,
  };
}

/**
 * Invalideer de answer-cache van een org+chatbot na een (her)ingest, zodat een
 * gewijzigd/verwijderd feit niet stil uit een stale gecachte response wordt
 * geserveerd (de KB-purge-landmijn, V0 PR #205). Best-effort: een gefaalde purge
 * mag de ingest niet laten omvallen. Caller-verantwoordelijkheid (NIET in
 * ingestDocument zelf) zodat een crawler die N pagina's ingestreert één keer ná
 * de batch purget i.p.v. N keer. Vereist een service-role client (answer_cache is
 * SELECT-only onder RLS).
 */
export async function purgeAnswerCache(
  client: SupabaseClient,
  organizationId: string,
  chatbotId: string,
): Promise<void> {
  const { error } = await client
    .from('answer_cache')
    .delete()
    .eq('organization_id', organizationId)
    .eq('chatbot_id', chatbotId);
  if (error) {
    console.warn(`[purgeAnswerCache] faalde voor org=${organizationId} chatbot=${chatbotId}: ${error.message}`);
  }
}
