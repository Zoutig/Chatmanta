'use server';

// V1 Kennisbank Q&A — server actions.
//
// Auth (SA-1): getSessionOrg() + requireOrgMember() vóór elke service-role-write.
// Org uit de getrouwde sessie (organization_members), NOOIT uit client-input.
// Élke mutatie scoopt .eq('organization_id').eq('chatbot_id') op de service-role-query
// (RLS-bypass → object-level guard). Reads na mutatie via dezelfde service-role client.
//
// ingest-side-effects zijn altijd best-effort: bij embed-timeout of quota-fout
// wordt de org_qa_items-rij toch opgeslagen (ingested_document_id=null).
// De caller (UI) hoeft dit niet te weten; het row-upsert faalt nooit om ingest.

import { revalidatePath } from 'next/cache';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { actionTry, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { ingestDocument, purgeAnswerCache } from '@/lib/rag/ingest';
import { getOrgChatbot } from '../../rag-config';

const KENNISBANK_PATH = '/v1/app/kennisbank';

// Inline — avoids a 'use server' → 'use client' type import cycle.
type QAItemShape = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  active: boolean;
  ingestedDocumentId: string | null;
};

type OrgCtx = { orgId: string; chatbotId: string; sb: ReturnType<typeof getV1ServiceRoleClient> };

async function requireOrgChatbot(): Promise<OrgCtx> {
  const { orgId } = await getSessionOrg();
  await requireOrgMember(orgId);
  const sb = getV1ServiceRoleClient();
  const chatbot = await getOrgChatbot(sb, orgId);
  if (!chatbot) throw new Error('Geen chatbot geconfigureerd voor deze org.');
  return { orgId, chatbotId: chatbot.id, sb };
}

function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e; // NEXT_REDIRECT (geen sessie) → /v1/login propageren
}

async function loadQAItems(
  sb: ReturnType<typeof getV1ServiceRoleClient>,
  orgId: string,
  chatbotId: string,
): Promise<QAItemShape[]> {
  const { data, error } = await sb
    .from('org_qa_items')
    .select('id, question, answer, category, active, ingested_document_id')
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`org_qa_items lezen: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    question: r.question as string,
    answer: r.answer as string,
    category: (r.category ?? null) as string | null,
    active: r.active as boolean,
    ingestedDocumentId: (r.ingested_document_id ?? null) as string | null,
  }));
}

/**
 * Upsert een Q&A-item. Op insert: org+chatbot uit de sessie (nooit client-input).
 * Op update: dezelfde (org, chatbot, id)-scope-check dwingt object-level access af.
 *
 * Ingest-side-effect (best-effort):
 * - active=true  → ingest als RAG-document (metadata.origin='manual_qa'); bij
 *   update wordt het oude doc soft-deleted (included=false) vóór de nieuwe ingest.
 * - active=false → bestaand doc soft-deleted (included=false), geen nieuwe ingest.
 *
 * ponytail: ingest-fout → ingested_document_id=null; rij wordt toch opgeslagen.
 * Upgrade-pad: retry-queue voor mislukte ingests.
 */
export async function upsertQAItemAction(input: {
  id?: string;
  question: string;
  answer: string;
  category?: string | null;
  active: boolean;
}): Promise<ActionResult<{ qa: QAItemShape[] }>> {
  let ctx: OrgCtx;
  try {
    ctx = await requireOrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const { orgId, chatbotId, sb } = ctx;
    const q = input.question.trim().slice(0, 2000);
    const a = input.answer.trim().slice(0, 8000);
    const cat = (input.category?.trim() || null) as string | null;
    const now = new Date().toISOString();

    // Op update: lees het huidige ingested_document_id (voor soft-delete van het oude doc).
    let oldDocId: string | null = null;
    if (input.id) {
      const { data: existing } = await sb
        .from('org_qa_items')
        .select('ingested_document_id')
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId)
        .maybeSingle();
      oldDocId = (existing?.ingested_document_id ?? null) as string | null;
    }

    // Soft-delete het vorige document (inhoud gaat sowieso veranderen bij een update).
    if (oldDocId) {
      await sb
        .from('documents')
        .update({ included: false })
        .eq('id', oldDocId)
        .eq('organization_id', orgId);
    }

    // Ingest het bijgewerkte Q&A-paar als de rij actief is.
    // ponytail: best-effort — ingest-fout mag de rij-upsert niet blokkeren.
    let newDocId: string | null = null;
    if (input.active) {
      try {
        const res = await ingestDocument(sb, {
          organizationId: orgId,
          chatbotId,
          filename: `qa-${q.slice(0, 40).replace(/\s+/g, '-') || 'item'}.txt`,
          text: `Vraag: ${q}\n\nAntwoord: ${a}`,
          source: 'upload',
          metadata: { origin: 'manual_qa' },
        });
        newDocId = res.documentId;
      } catch {
        // ponytail: best-effort — rij opgeslagen zonder ingest-koppeling; upgrade: retry-queue
      }
    }

    if (input.id) {
      const { error } = await sb
        .from('org_qa_items')
        .update({
          question: q,
          answer: a,
          category: cat,
          active: input.active,
          ingested_document_id: newDocId,
          updated_at: now,
        })
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId);
      if (error) throw new Error(`org_qa_items update: ${error.message}`);
    } else {
      const { error } = await sb.from('org_qa_items').insert({
        organization_id: orgId,
        chatbot_id: chatbotId,
        question: q,
        answer: a,
        category: cat,
        active: input.active,
        ingested_document_id: newDocId,
      });
      if (error) throw new Error(`org_qa_items insert: ${error.message}`);
    }

    // Q&A-content veranderde → wat de bot vindt verandert → answer-cache invalideren.
    // ponytail: best-effort (purge-fout mag de action niet doen mislukken)
    try {
      await purgeAnswerCache(sb, orgId, chatbotId);
    } catch {
      /* best-effort */
    }
    revalidatePath(KENNISBANK_PATH);
    return { qa: await loadQAItems(sb, orgId, chatbotId) };
  });
}

/**
 * Verwijder een Q&A-item (org+chatbot-gescoopt) en soft-delete het bijbehorende
 * ingest-document best-effort (excluded=false → uit retrieval).
 */
export async function deleteQAItemAction(id: string): Promise<ActionResult<{ qa: QAItemShape[] }>> {
  let ctx: OrgCtx;
  try {
    ctx = await requireOrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const { orgId, chatbotId, sb } = ctx;

    // Lees ingested_document_id vóór de delete (de rij verdwijnt daarna).
    const { data: row } = await sb
      .from('org_qa_items')
      .select('ingested_document_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .maybeSingle();
    const docId = (row?.ingested_document_id ?? null) as string | null;

    const { error } = await sb
      .from('org_qa_items')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId);
    if (error) throw new Error(`org_qa_items delete: ${error.message}`);

    // Best-effort soft-delete: het document blijft in de DB maar wordt uit retrieval
    // gehaald (included=false). Hard-delete is deferred (cleanup-cron, V2-pad).
    if (docId) {
      await sb
        .from('documents')
        .update({ included: false })
        .eq('id', docId)
        .eq('organization_id', orgId);
    }

    try {
      await purgeAnswerCache(sb, orgId, chatbotId);
    } catch {
      /* best-effort */
    }
    revalidatePath(KENNISBANK_PATH);
    return { qa: await loadQAItems(sb, orgId, chatbotId) };
  });
}

/**
 * Toggle de active-vlag. Ingest of de-ingest het RAG-document best-effort:
 * - active=true  + bestaand doc → set included=true (re-activeer; geen nieuwe embed-kost)
 * - active=true  + geen doc     → ingest nieuw document
 * - active=false               → set included=false op bestaand doc
 */
export async function setQAActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ qa: QAItemShape[] }>> {
  let ctx: OrgCtx;
  try {
    ctx = await requireOrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const { orgId, chatbotId, sb } = ctx;

    const { data: row } = await sb
      .from('org_qa_items')
      .select('question, answer, ingested_document_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .maybeSingle();
    if (!row) throw new Error('Q&A-item niet gevonden.');

    const existingDocId = (row.ingested_document_id ?? null) as string | null;
    let newDocId: string | null = existingDocId;

    if (active) {
      if (existingDocId) {
        // Re-activeer het bestaande document (geen nieuwe embed-kost).
        await sb
          .from('documents')
          .update({ included: true })
          .eq('id', existingDocId)
          .eq('organization_id', orgId);
      } else {
        // Geen bestaand document → ingest (best-effort).
        try {
          const res = await ingestDocument(sb, {
            organizationId: orgId,
            chatbotId,
            filename: 'qa-toggle.txt',
            text: `Vraag: ${row.question}\n\nAntwoord: ${row.answer}`,
            source: 'upload',
            metadata: { origin: 'manual_qa' },
          });
          newDocId = res.documentId;
        } catch {
          // ponytail: best-effort — active=true zonder ingest-koppeling is acceptabel
        }
      }
    } else if (existingDocId) {
      // Deactiveren → out of retrieval zetten (soft-delete).
      await sb
        .from('documents')
        .update({ included: false })
        .eq('id', existingDocId)
        .eq('organization_id', orgId);
    }

    const now = new Date().toISOString();
    const { error } = await sb
      .from('org_qa_items')
      .update({ active, ingested_document_id: newDocId, updated_at: now })
      .eq('id', id)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId);
    if (error) throw new Error(`org_qa_items toggle: ${error.message}`);

    try {
      await purgeAnswerCache(sb, orgId, chatbotId);
    } catch {
      /* best-effort */
    }
    revalidatePath(KENNISBANK_PATH);
    return { qa: await loadQAItems(sb, orgId, chatbotId) };
  });
}
