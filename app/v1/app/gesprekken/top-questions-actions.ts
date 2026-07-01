'use server';

// V1 Gesprekken — FAQ top-questions server actions.
//
// Auth (SA-1): getSessionOrg() + requireOrgMember() vóór elke service-role-write.
// Org ALTIJD uit de getrouwde sessie (organization_members), nooit uit client-input.

import { revalidatePath } from 'next/cache';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { createClient } from '@/lib/supabase/v1/server';
import { actionTry, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { getOrgChatbot } from '../rag-config';
import { saveV1FaqConfig } from '@/lib/v1/dashboard/faq';
import { upsertQAItemAction } from '../kennisbank/qa/qa-actions';
import type { TopQuestionsConfig } from '@/lib/v0/klantendashboard/types';

const GESPREKKEN_PATH = '/v1/app/gesprekken';

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
  if (isAppError(e)) {
    return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  }
  throw e; // NEXT_REDIRECT (geen sessie) → /v1/login propageren
}

/**
 * Sla de FAQ-ranglijst-config op (drempel + lijst-grootte).
 * SA-1: org+chatbot uit sessie; schrijft via service-role naar klant_faq_config.
 */
export async function saveTopQuestionsConfigAction(
  config: TopQuestionsConfig,
): Promise<ActionResult<{ topQuestions: TopQuestionsConfig }>> {
  let ctx: OrgCtx;
  try {
    ctx = await requireOrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const { orgId, chatbotId, sb } = ctx;
    const topQuestions = await saveV1FaqConfig(sb, orgId, chatbotId, config);
    revalidatePath(GESPREKKEN_PATH, 'layout');
    return { topQuestions };
  });
}

export type QuestionConversationHit = {
  threadId: string;
  snippet: string;
  askedAt: string;
};

/** Hoeveel user-messages we ophalen vóór de client-side variant-match. */
const DRILLDOWN_ROW_CAP = 1000;
/** Hoeveel unieke gesprekken we max teruggeven. */
const DRILLDOWN_RESULT_CAP = 50;

/**
 * Drilldown: gesprekken (thread_id + snippet) waarin één van de cluster-
 * varianten is gesteld. Leest via session-client (RLS → org-isolatie).
 * Read-only: geen revalidatePath.
 */
export async function getConversationsForQuestionAction(
  memberQuestions: string[],
): Promise<ActionResult<{ hits: QuestionConversationHit[] }>> {
  let ctx: OrgCtx;
  try {
    ctx = await requireOrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  const { orgId, chatbotId } = ctx;
  return actionTry(async () => {
    const variants = [
      ...new Set(
        (memberQuestions ?? [])
          .map((q) => String(q ?? '').trim().toLowerCase())
          .filter((q) => q.length > 0),
      ),
    ];
    if (variants.length === 0) return { hits: [] };

    // Session-client: RLS sluit org-isolatie af. thread_messages heeft
    // organization_id direct op de rij (geen thread-join nodig).
    const client = await createClient();
    const { data: rows, error } = await client
      .from('thread_messages')
      .select('thread_id, content, created_at')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(DRILLDOWN_ROW_CAP);
    if (error) throw new Error(`thread_messages read: ${error.message}`);

    const wanted = new Set(variants);
    const seen = new Set<string>();
    const hits: QuestionConversationHit[] = [];
    for (const r of rows ?? []) {
      const content = String(r.content ?? '');
      const key = content.trim().toLowerCase();
      if (!wanted.has(key)) continue;
      const tid = String(r.thread_id ?? '');
      if (!tid || seen.has(tid)) continue; // dedupe per thread (recent-first)
      seen.add(tid);
      hits.push({
        threadId: tid,
        snippet: content.trim().slice(0, 160),
        askedAt: String(r.created_at ?? ''),
      });
      if (hits.length >= DRILLDOWN_RESULT_CAP) break;
    }
    return { hits };
  });
}

/**
 * "Maak Q&A" vanuit de top-questions-tab.
 * Wrapper om upsertQAItemAction (SA-1 en ingest zitten daarin).
 * Revalideert ook het gesprekken-pad zodat het item-teller klopt.
 */
export async function addQAFromTopQuestionAction(
  question: string,
  answer: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await upsertQAItemAction({ question, answer, active: true });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath(GESPREKKEN_PATH, 'layout');
  return { ok: true };
}
