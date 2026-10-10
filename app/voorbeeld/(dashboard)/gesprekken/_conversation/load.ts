// Gedeelde loader voor één gesprek: gebruikt door de volledige pagina
// (gesprekken/[id]) én het zijpaneel (@drawer/(.)[id]). In het voorbeeld leest
// hij de vaste voorbeeldgesprekken; gesprekken die de bezoeker zelf voerde
// (id met prefix "eigen-") rendert OwnConversation client-side uit de demo-opslag.

import type { V1ConversationDetail } from '@/lib/v1/dashboard/conversations';
import { getFixtureConversation } from '@/lib/voorbeeld/fixtures/gesprekken';

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

/** Status en Q&A-vraag afleiden uit de berichten (zelfde regels als V1). */
export function deriveConversation(detail: V1ConversationDetail): LoadedConversation {
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

  return { detail, isUnanswered, questionForQA: question?.content ?? '' };
}

export async function loadConversation(id: string): Promise<ConversationLoad> {
  const detail = getFixtureConversation(id);
  if (!detail) return { status: 'not_found' };
  return { status: 'ok', ...deriveConversation(detail) };
}
