'use server';

// V1 Gesprekken — server actions.
//
// Auth (SA-1): getSessionOrg() + requireOrgMember() vóór elke service-role-write.
// Org uit de getrouwde sessie, NOOIT uit client-input. Elke mutatie scoopt
// bovendien .eq('organization_id') op de service-role-query (RLS-bypass →
// object-level guard). Reads via de session-client (RLS); writes via de V1
// service-role.
//
// Q&A vanuit een gesprek schrijft NIET meer hier: de knop linkt naar het Q&A-venster
// in de Kennisbank (?prefillQuestion=), zodat de klant eerst een antwoord schrijft.
// Vroeger sloeg deze actie direct een actieve Q&A op met "(nog in te vullen)".

import { revalidatePath } from 'next/cache';
import { getSessionOrg } from '@/lib/auth';
import { requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { createClient } from '@/lib/supabase/v1/server';
import { loadUnanswered } from '@/lib/v1/dashboard/unanswered';
import { normalizeQuestionKey } from '@/lib/v1/dashboard/unanswered-core';
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
  revalidatePath('/v1/app', 'layout'); // zijbalk-teller + Overzicht
  return { ok: true };
}

/**
 * Werklijst "Wist je chatbot niet": markeer één vraag als opgelost zonder hem te
 * beantwoorden. Er is geen eigen status-kolom per vraag; "opgelost" = de gesprekken
 * waarin deze vraag een fallback kreeg krijgen status 'closed' (dezelfde markering als
 * "Markeer als opgelost" in een gesprek). Stelt een bezoeker de vraag later opnieuw en
 * weet de chatbot het weer niet, dan staat hij vanzelf weer open.
 *
 * SA-1: org uit de sessie; de gesprekken worden server-side bepaald uit de vraagtekst
 * (via de RLS-session-client) en de update scoopt op org + chatbot. Geen ID's van de client.
 */
export async function markQuestionResolvedAction(
  question: string,
): Promise<{ ok: boolean; error?: string; closed?: number }> {
  let ctx: OrgCtx;
  try {
    ctx = await requireOrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  const { orgId, chatbotId, sb } = ctx;
  const key = normalizeQuestionKey(String(question ?? '').slice(0, 2000));
  if (!key) return { ok: false, error: 'Geen vraag opgegeven.' };

  const session = await createClient();
  const overview = await loadUnanswered(session, orgId, chatbotId);
  const target = overview.questions.find((q) => q.key === key);
  const threadIds = target?.threadIds ?? [];
  if (threadIds.length === 0) {
    return {
      ok: false,
      error: 'Deze vraag hoort niet bij een gesprek met een bezoeker (bijvoorbeeld een testvraag). Hij verdwijnt na 30 dagen vanzelf.',
    };
  }

  const { error } = await sb
    .from('threads')
    .update({ status: 'closed' })
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId)
    .in('id', threadIds);
  if (error) return { ok: false, error: `Opslaan mislukt: ${error.message}` };

  revalidatePath(GESPREKKEN_PATH);
  revalidatePath('/v1/app', 'layout');
  return { ok: true, closed: threadIds.length };
}
