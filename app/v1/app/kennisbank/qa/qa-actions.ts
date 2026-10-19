'use server';

// V1 Kennisbank Q&A — server actions.
//
// Auth (SA-1): getSessionOrg() + requireOrgMember() vóór elke service-role-write.
// Org uit de getrouwde sessie (organization_members), NOOIT uit client-input.
// Élke mutatie scoopt .eq('organization_id').eq('chatbot_id') op de service-role-query
// (RLS-bypass → object-level guard). Reads na mutatie via dezelfde service-role client.
//
// Ingest-fouten zijn zichtbaar, nooit stil:
// - nieuw item: de rij wordt bewaard (ingested_document_id=null) en de action meldt
//   notIngested=true; de lijst toont "Nog niet in je chatbot" met een retry-knop;
// - bewerken: eerst de nieuwe ingest, pas daarna het oude document uitzetten. Faalt de
//   ingest, dan blijft alles zoals het was (oude antwoord blijft actief) en krijgt de
//   klant een foutmelding, zodat de bot nooit stil zijn kennis kwijtraakt;
// - aanzetten zonder document: faalt de ingest, dan blijft het item uit + foutmelding.

import { revalidatePath } from 'next/cache';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { actionTry, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { ingestDocument, purgeAnswerCache } from '@/lib/rag/ingest';
import { runQAUpsert } from '@/lib/v1/dashboard/qa-upsert-core';
import { getOrgChatbot } from '../../rag-config';

const KENNISBANK_PATH = '/v1/app/kennisbank';

type Sb = ReturnType<typeof getV1ServiceRoleClient>;

/** Lees een Q&A-paar in als RAG-document. null = ingest mislukt (gelogd). */
async function ingestQA(sb: Sb, orgId: string, chatbotId: string, q: string, a: string): Promise<string | null> {
  try {
    const res = await ingestDocument(sb, {
      organizationId: orgId,
      chatbotId,
      filename: `qa-${q.slice(0, 40).replace(/\s+/g, '-') || 'item'}.txt`,
      text: `Vraag: ${q}\n\nAntwoord: ${a}`,
      source: 'upload',
      metadata: { origin: 'manual_qa' },
    });
    return res.documentId;
  } catch (e) {
    console.error('[v1:qa] ingest faalde', (e as Error).message);
    return null;
  }
}

/** Haal een (vervangen of overbodig) Q&A-document uit de retrieval. */
async function retireDoc(sb: Sb, orgId: string, chatbotId: string, docId: string): Promise<void> {
  await sb
    .from('documents')
    .update({ included: false, deleted_at: new Date().toISOString() })
    .eq('id', docId)
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId);
}

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
 * Volgorde bij een actief item: eerst de nieuwe ingest; pas als die lukt wordt het
 * oude document uit de retrieval gehaald (runQAUpsert, met unit-tests). Zie de kop van
 * dit bestand voor wat er bij een mislukte ingest gebeurt.
 */
export async function upsertQAItemAction(input: {
  id?: string;
  question: string;
  answer: string;
  category?: string | null;
  active: boolean;
}): Promise<ActionResult<{ qa: QAItemShape[]; notIngested: boolean }>> {
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

    const id = input.id;
    const { notIngested } = await runQAUpsert(
      { isUpdate: !!id, active: input.active },
      {
        // Op update: bestaat het item (in deze org+chatbot) en welk document hoort erbij?
        readOldDocId: async () => {
          const { data: existing, error: readErr } = await sb
            .from('org_qa_items')
            .select('ingested_document_id')
            .eq('id', id as string)
            .eq('organization_id', orgId)
            .eq('chatbot_id', chatbotId)
            .maybeSingle();
          if (readErr) throw new Error(`org_qa_items lezen: ${readErr.message}`);
          if (!existing) throw new Error('Q&A-item niet gevonden.');
          return (existing.ingested_document_id ?? null) as string | null;
        },
        ingest: () => ingestQA(sb, orgId, chatbotId, q, a),
        saveRow: async (newDocId) => {
          if (id) {
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
              .eq('id', id)
              .eq('organization_id', orgId)
              .eq('chatbot_id', chatbotId);
            return error ? `org_qa_items update: ${error.message}` : null;
          }
          const { error } = await sb.from('org_qa_items').insert({
            organization_id: orgId,
            chatbot_id: chatbotId,
            question: q,
            answer: a,
            category: cat,
            active: input.active,
            ingested_document_id: newDocId,
          });
          return error ? `org_qa_items insert: ${error.message}` : null;
        },
        retire: (docId) => retireDoc(sb, orgId, chatbotId, docId),
      },
    );

    // Q&A-content veranderde → wat de bot vindt verandert → answer-cache invalideren.
    // purgeAnswerCache logt zelf en gooit niet.
    await purgeAnswerCache(sb, orgId, chatbotId);
    revalidatePath(KENNISBANK_PATH);
    return { qa: await loadQAItems(sb, orgId, chatbotId), notIngested };
  });
}

/**
 * Probeer een actief Q&A-item zonder document opnieuw in te lezen (na een eerdere
 * mislukte ingest). Object-level: het item moet in deze org+chatbot bestaan. De
 * koppeling is conditioneel (alleen als er nog geen document is), zodat een
 * dubbelklik nooit twee documenten oplevert.
 */
export async function retryQAIngestAction(id: string): Promise<ActionResult<{ qa: QAItemShape[] }>> {
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
      .select('question, answer, active, ingested_document_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .maybeSingle();
    if (!row) throw new Error('Q&A-item niet gevonden.');
    if (row.active && !row.ingested_document_id) {
      const docId = await ingestQA(sb, orgId, chatbotId, row.question as string, row.answer as string);
      if (!docId) throw new Error('Je chatbot kon dit antwoord nog niet verwerken. Probeer het later opnieuw.');
      const { data: linked } = await sb
        .from('org_qa_items')
        .update({ ingested_document_id: docId })
        .eq('id', id)
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId)
        .is('ingested_document_id', null)
        .select('id');
      if (!linked || linked.length === 0) await retireDoc(sb, orgId, chatbotId, docId);
      else await purgeAnswerCache(sb, orgId, chatbotId);
    }
    revalidatePath(KENNISBANK_PATH);
    return { qa: await loadQAItems(sb, orgId, chatbotId) };
  });
}

/**
 * Verwijder een Q&A-item (org+chatbot-gescoopt) en soft-delete het bijbehorende
 * ingest-document best-effort (retireDoc → uit retrieval).
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

    // Best-effort soft-delete: het document blijft in de DB maar gaat uit retrieval
    // (included=false + deleted_at, zelfde als een vervangen Q&A-document). Hard-delete
    // is deferred (cleanup-cron, V2-pad).
    if (docId) await retireDoc(sb, orgId, chatbotId, docId);

    await purgeAnswerCache(sb, orgId, chatbotId); // logt zelf, gooit niet
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
        // Geen bestaand document → ingest. Mislukt dat, dan blijft het item uit en
        // krijgt de klant een melding (niet stil "aan" zonder dat de bot het kent).
        newDocId = await ingestQA(sb, orgId, chatbotId, row.question as string, row.answer as string);
        if (!newDocId) throw new Error('Je chatbot kon dit antwoord nu niet verwerken. Probeer het zo opnieuw.');
      }
    } else if (existingDocId) {
      // Deactiveren → alleen included=false, bewust GEEN deleted_at (geen retireDoc):
      // weer aanzetten hergebruikt dit document zonder nieuwe embed-kost.
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

    await purgeAnswerCache(sb, orgId, chatbotId); // logt zelf, gooit niet
    revalidatePath(KENNISBANK_PATH);
    return { qa: await loadQAItems(sb, orgId, chatbotId) };
  });
}
