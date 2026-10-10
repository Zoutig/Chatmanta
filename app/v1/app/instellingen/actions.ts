'use server';

// V1 chatbot-settings — save-action (member-scoped, service-role-write).
//
// SA-1: org uit de getrouwde sessie (getSessionOrg), NOOIT uit client/env, +
// expliciete requireOrgMember(orgId)-gate vóór de service-role-write. De write
// scoopt .eq(organization_id).eq(id) zodat alléén de eigen chatbot wordt geraakt
// (RLS-bypass → object-level guard). De write zelf (atomische merge + purge van de
// answer-cache als antwoord-velden veranderen) zit in settings-store.ts.

import { revalidatePath } from 'next/cache';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { getOrgChatbot } from '../rag-config';
import { sanitizeChatbotPatch, type V1ChatbotSettings } from './settings-config';
import { writeChatbotSettingsPatch } from './settings-store';

const SETTINGS_PATH = '/v1/app/instellingen';

/** Map een auth-fout naar ActionFail; laat NEXT_REDIRECT (geen sessie) propageren. */
function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e;
}

export async function saveChatbotSettingsAction(
  patch: Partial<V1ChatbotSettings>,
): Promise<ActionResult<{ settings: V1ChatbotSettings }>> {
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

    // NIT-hardening: beperk de client-patch tot de antwoord-beïnvloedende velden die
    // de UI toont + cap de vrije-tekstvelden (geen vreemde velden / prompt-bloat).
    const safePatch = sanitizeChatbotPatch(patch);

    // Atomische merge in de DB (migr 0028) + purge alleen bij antwoord-wijziging.
    const next = await writeChatbotSettingsPatch(svc, orgId, chatbot, safePatch);

    revalidatePath(SETTINGS_PATH);
    return { settings: next };
  });
}
