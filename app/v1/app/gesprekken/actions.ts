'use server';

// V1 Gesprekken — server actions.
//
// Auth (SA-1): getSessionOrg() + requireOrgMember() vóór elke service-role-write.
// Org uit de getrouwde sessie, NOOIT uit client-input. Elke mutatie scoopt
// bovendien .eq('organization_id') op de service-role-query (RLS-bypass →
// object-level guard). Reads via de session-client (RLS); writes via de V1
// service-role.
//
// org_qa_items: ook beschreven door de Kennisbank Q&A-agent (0013_v1_qa_items.sql).
// Beide schrijvers stampen dezelfde (organization_id, chatbot_id) — geen conflict,
// wel coördinatie nodig bij dedup-beleid (dezelfde vraag twee keer → twee rijen).
// Upgrade-pad: unique constraint op (org, chatbot, lower(question)) als dat pijn geeft.

import { revalidatePath } from 'next/cache';
import { getSessionOrg } from '@/lib/auth';
import { requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { ingestDocument } from '@/lib/rag/ingest';
import { getOrgChatbot } from '../rag-config';

const GESPREKKEN_PATH = '/v1/app/gesprekken';

type OrgCtx = { orgId: string; chatbotId: string; sb: ReturnType<typeof getV1ServiceRoleClient> };

/** SA-1: org uit sessie + membership-check + chatbot-lookup via service-role. */
async function requireOrgChatbot(): Promise<OrgCtx> {
  const { orgId } = await getSessionOrg();
  await requireOrgMember(orgId);
  const sb = getV1ServiceRoleClient();
  const chatbot = await getOrgChatbot(sb, orgId);
  if (!chatbot) throw new Error('Geen chatbot geconfigureerd voor deze org.');
  return { orgId, chatbotId: chatbot.id, sb };
}

function authFail(e: unknown): { ok: false; error: string } {
  if (isAppError(e)) return { ok: false, error: e.message };
  throw e; // NEXT_REDIRECT (geen sessie) propageren → /v1/login
}

/**
 * Maakt een Q&A-item aan vanuit een gesprek-transcript.
 * Ingest het ook meteen in de RAG-store zodat het direct vindbaar is.
 * ingested_document_id = null als de ingest faalt (niet-fataal).
 */
export async function addQAFromConversationAction(
  threadId: string,
  question: string,
  answer: string,
): Promise<{ ok: boolean; error?: string }> {
  let ctx: OrgCtx;
  try {
    ctx = await requireOrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  const { orgId, chatbotId, sb } = ctx;

  const q = question.trim().slice(0, 2000) || '(geen vraag)';
  const a = answer.trim().slice(0, 8000) || '(nog in te vullen)';

  // Ingest: Q&A tekst als document in de kennisbank zodat het RAG het meteen oppikt.
  // ponytail: niet-fataal — bij ingest-fout (embed-timeout, quota) de row toch
  // inserten met ingested_document_id=null; upgrade-pad: retry-queue.
  let ingestedDocumentId: string | null = null;
  try {
    const res = await ingestDocument(sb, {
      organizationId: orgId,
      chatbotId,
      filename: `q-a-${threadId.slice(0, 8)}.txt`,
      text: `Vraag: ${q}\n\nAntwoord: ${a}`,
      source: 'upload',
      metadata: { origin: 'manual_qa', thread_id: threadId },
    });
    ingestedDocumentId = res.documentId;
  } catch {
    // ponytail: stil door — rij wordt aangemaakt zonder ingest-koppeling
  }

  const { error } = await sb.from('org_qa_items').insert({
    organization_id: orgId,
    chatbot_id: chatbotId,
    question: q,
    answer: a,
    active: true,
    ingested_document_id: ingestedDocumentId,
  });
  if (error) return { ok: false, error: `Q&A opslaan mislukt: ${error.message}` };

  revalidatePath(`${GESPREKKEN_PATH}/${threadId}`);
  return { ok: true };
}

/**
 * Markeert een gesprek als opgelost (status = 'closed').
 * Revalideert zowel het detail-scherm als de lijst (statusbadge).
 */
export async function markConversationResolvedAction(
  threadId: string,
): Promise<{ ok: boolean; error?: string }> {
  let ctx: OrgCtx;
  try {
    ctx = await requireOrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  const { orgId, sb } = ctx;

  const { error } = await sb
    .from('threads')
    .update({ status: 'closed' })
    .eq('id', threadId)
    .eq('organization_id', orgId);
  if (error) return { ok: false, error: `Opslaan mislukt: ${error.message}` };

  revalidatePath(`${GESPREKKEN_PATH}/${threadId}`);
  revalidatePath(GESPREKKEN_PATH);
  return { ok: true };
}
