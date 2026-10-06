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
  return { ok: true };
}
