// Gedeelde loader voor één gesprek: gebruikt door de volledige pagina
// (gesprekken/[id]) én het zijpaneel (@drawer/(.)[id]). Eén query-pad, één
// auth-keten, zodat beide vormen precies dezelfde toegang hebben.
//
// Auth: getSessionOrg → AUTH_FORBIDDEN / NEXT_REDIRECT. Read via de session-client
// (RLS): een thread van een andere org geeft null terug → 'not_found'. Geen
// service-role nodig.

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getV1Conversation, type V1ConversationDetail } from '@/lib/v1/dashboard/conversations';

export type LoadedConversation = {
  detail: V1ConversationDetail;
  isUnanswered: boolean;
  /** De bezoekersvraag die bij het laatste bot-antwoord hoort (voor "Antwoord geven"). */
  questionForQA: string;
};

export type ConversationLoad =
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | ({ status: 'ok' } & LoadedConversation);

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

  // Status afleiden uit het laatste assistant-bericht.
  const lastAssistant = [...detail.messages].reverse().find((m) => m.role === 'assistant');
  const isUnanswered = lastAssistant?.kind === 'fallback';

  // De bezoekersvraag die bij het láátste bot-antwoord hoort: bij een onbeantwoord
  // gesprek is dat precies de vraag waar de bot op afhaakte.
  const lastAssistantIdx = lastAssistant ? detail.messages.indexOf(lastAssistant) : -1;
  const question =
    detail.messages
      .slice(0, lastAssistantIdx >= 0 ? lastAssistantIdx : undefined)
      .reverse()
      .find((m) => m.role === 'user') ?? detail.messages.find((m) => m.role === 'user');

  return { status: 'ok', detail, isUnanswered, questionForQA: question?.content ?? '' };
}
