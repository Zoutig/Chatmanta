'use server';

// V1 Widget — levenscyclus-actions (WP2): pauzeer/activeer-toggle + installatie-check.
//
// SA-1 (toggle): org uit de getrouwde sessie (getSessionOrg), NOOIT uit client-input,
// + expliciete requireOrgMember(orgId)-gate vóór de service-role-write. De write
// scoopt .eq(organization_id).eq(id) — zelfde patroon als saveChatbotSettingsAction.
// Geen answer-cache-purge nodig: is_active beïnvloedt geen antwoorden, alleen de
// render-/route-gates (loadV1Embed + /api/v1/chat).
//
// De installatie-check is een verse RLS-read (session-client): geen service-role,
// geen schrijfpad — hij haalt alleen widget_last_seen_at/origin opnieuw op.

import { revalidatePath } from 'next/cache';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { createClient } from '@/lib/supabase/v1/server';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { getOrgChatbot } from '../rag-config';

const WIDGET_PATH = '/v1/app/widget';

export type WidgetLiveStatus = {
  isActive: boolean;
  lastSeenAt: string | null;
  lastSeenOrigin: string | null;
};

/** Map een auth-fout naar ActionFail; laat NEXT_REDIRECT (geen sessie) propageren. */
function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e;
}

export async function toggleWidgetActiveAction(
  nextActive: boolean,
): Promise<ActionResult<{ isActive: boolean }>> {
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

    const { error } = await svc
      .from('chatbots')
      .update({ is_active: nextActive === true })
      .eq('organization_id', orgId)
      .eq('id', chatbot.id);
    if (error) throw new Error(`widget-status opslaan faalde: ${error.message}`);

    revalidatePath(WIDGET_PATH);
    return { isActive: nextActive === true };
  });
}

export async function checkWidgetInstallationAction(): Promise<ActionResult<WidgetLiveStatus>> {
  try {
    await getSessionOrg();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const supabase = await createClient();
    const { orgId } = await getSessionOrg();
    const { data, error } = await supabase
      .from('chatbots')
      .select('is_active, widget_last_seen_at, widget_last_seen_origin')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`installatie-check faalde: ${error.message}`);
    if (!data) fail('NOT_FOUND', 'Deze organisatie heeft nog geen chatbot.');

    return {
      isActive: data.is_active !== false,
      lastSeenAt: (data.widget_last_seen_at as string | null) ?? null,
      lastSeenOrigin: (data.widget_last_seen_origin as string | null) ?? null,
    };
  });
}
