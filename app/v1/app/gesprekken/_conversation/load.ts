// Gedeelde loader voor één gesprek: gebruikt door de volledige pagina
// (gesprekken/[id]) én het zijpaneel (@drawer/(.)[id]). Eén query-pad, één
// auth-keten, zodat beide vormen precies dezelfde toegang hebben.
//
// Auth: getSessionOrg → AUTH_FORBIDDEN / NEXT_REDIRECT. Read via de session-client
// (RLS): een thread van een andere org geeft null terug → 'not_found'. Geen
// service-role nodig.
//
// "Onbeantwoord" volgt de gedeelde definitie (lib/v1/dashboard/unanswered.ts): het
// gesprek heeft een fallback op een vraag die nog open staat (niet off-topic, niet
// afgehandeld, gesprek niet "opgelost"). De vraag voor "Antwoord geven" is díe vraag,
// ook als hij eerder in het gesprek viel dan het laatste bot-antwoord.

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getV1Conversation, type V1ConversationDetail } from '@/lib/v1/dashboard/conversations';
import { getOrgChatbot } from '@/app/v1/app/rag-config';
import { getUnansweredForOrg } from '@/lib/v1/dashboard/unanswered';
import { normalizeQuestionKey } from '@/lib/v1/dashboard/unanswered-core';

export type LoadedConversation = {
  detail: V1ConversationDetail;
  isUnanswered: boolean;
  /** Gesprek staat op "opgelost" (threads.status='closed'). */
  isClosed: boolean;
  /** De bezoekersvraag waar de bot op afhaakte (of anders de laatste vraag). */
  questionForQA: string;
};

export type ConversationLoad =
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | ({ status: 'ok' } & LoadedConversation);

/** Bezoekersvraag direct vóór bericht `idx`. */
function userBefore(detail: V1ConversationDetail, idx: number): string | null {
  for (let i = idx - 1; i >= 0; i--) {
    if (detail.messages[i].role === 'user') return detail.messages[i].content;
  }
  return null;
}

export async function loadConversation(id: string): Promise<ConversationLoad> {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') return { status: 'forbidden' };
    throw e; // NEXT_REDIRECT → /v1/login
  }

  const supabase = await createClient();
  const detail = await getV1Conversation(supabase, orgId, id);
  if (!detail) return { status: 'not_found' };

  const isClosed = detail.thread.status === 'closed';
  const chatbot = await getOrgChatbot(supabase, orgId);
  const unanswered = chatbot ? await getUnansweredForOrg(orgId, chatbot.id) : null;
  const openKeys = new Set((unanswered?.questions ?? []).filter((q) => q.status === 'open').map((q) => q.key));

  // Laatste fallback in dit gesprek waarvan de vraag nog open staat.
  let openQuestion: string | null = null;
  for (let i = detail.messages.length - 1; i >= 0 && !openQuestion; i--) {
    const m = detail.messages[i];
    if (m.role !== 'assistant' || m.kind !== 'fallback') continue;
    const q = userBefore(detail, i);
    if (q && openKeys.has(normalizeQuestionKey(q))) openQuestion = q;
  }
  const isUnanswered = !isClosed && openQuestion !== null && (unanswered?.openThreadIds.has(id) ?? false);

  // Anders: de vraag bij het láátste bot-antwoord (voor "Maak Q&A van deze vraag").
  const lastAssistantIdx = detail.messages.map((m) => m.role).lastIndexOf('assistant');
  const fallbackQuestion =
    (lastAssistantIdx >= 0 ? userBefore(detail, lastAssistantIdx) : null) ??
    detail.messages.find((m) => m.role === 'user')?.content ??
    '';

  return {
    status: 'ok',
    detail,
    isUnanswered,
    isClosed,
    questionForQA: isUnanswered && openQuestion ? openQuestion : fallbackQuestion,
  };
}
