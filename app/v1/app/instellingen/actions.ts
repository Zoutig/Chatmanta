'use server';

// V1 chatbot-settings — save-action (member-scoped, service-role-write).
//
// SA-1: org uit de getrouwde sessie (getSessionOrg), NOOIT uit client/env, +
// expliciete requireOrgMember(orgId)-gate vóór de service-role-write. De write
// scoopt .eq(organization_id).eq(id) zodat alléén de eigen chatbot wordt geraakt
// (RLS-bypass → object-level guard). Ná de write purgen we de answer-cache: zonder
// purge overleeft een stale cache-hit een toon-/fallback-wijziging (bewezen V0-bug).

import { revalidatePath } from 'next/cache';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { purgeAnswerCache } from '@/lib/rag/ingest';
import type { ChatbotSettings } from '@/lib/v0/klantendashboard/types';
import { getOrgChatbot } from '../rag-config';
import { getChatbotSettings } from './settings-config';

const SETTINGS_PATH = '/v1/app/instellingen';

/** Map een auth-fout naar ActionFail; laat NEXT_REDIRECT (geen sessie) propageren. */
function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e;
}

export async function saveChatbotSettingsAction(
  patch: Partial<ChatbotSettings>,
): Promise<ActionResult<{ settings: ChatbotSettings }>> {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
    await requireOrgMember(orgId); // SA-1 — expliciete gate vóór de service-role-write
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const svc = getV1ServiceRoleClient();
    const chatbot = await getOrgChatbot(svc, orgId);
    if (!chatbot) fail('NOT_FOUND', 'Deze organisatie heeft nog geen chatbot.');

    // Merge patch over de huidige (over defaults gemergde) settings → compleet object.
    const current = await getChatbotSettings(svc, chatbot.id);
    const next: ChatbotSettings = { ...current, ...patch };

    const { error } = await svc
      .from('chatbots')
      .update({ settings: next })
      .eq('organization_id', orgId)
      .eq('id', chatbot.id);
    if (error) throw new Error(`chatbot-settings opslaan faalde: ${error.message}`);

    // Toon/taal/fallback zitten niet in de cache-key → settings-wijziging propageert
    // pas ná een purge. Awaiten (geen fire-and-forget): serverless kan de runtime na
    // de response killen. Een gefaalde purge draait de save niet terug (best-effort).
    await purgeAnswerCache(svc, orgId, chatbot.id);

    revalidatePath(SETTINGS_PATH);
    return { settings: next };
  });
}
