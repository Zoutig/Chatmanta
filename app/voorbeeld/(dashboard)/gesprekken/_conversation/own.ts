// Gesprekken die de bezoeker zelf met de voorbeeldwidget voerde (demo-opslag,
// localStorage) omzetten naar de vormen die de V1-lijst en ConversationView
// verwachten. Pure helpers, client én server.

import type { V1ConversationDetail, V1ConversationListItem } from '@/lib/v1/dashboard/conversations';
import type { DemoConversation } from '@/lib/voorbeeld/demo-store';

export const OWN_PREFIX = 'eigen-';

function safeDecode(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export function isOwnConversationId(id: string): boolean {
  return safeDecode(id).startsWith(OWN_PREFIX);
}

export function ownConversationId(c: DemoConversation): string {
  return `${OWN_PREFIX}${c.id}`;
}

/** Store-id terug uit een (mogelijk ge-encodeerde) route-id. */
export function storeIdFromRoute(id: string): string {
  return safeDecode(id).slice(OWN_PREFIX.length);
}

export function ownToListItem(c: DemoConversation): V1ConversationListItem {
  const last = c.turns[c.turns.length - 1];
  return {
    id: ownConversationId(c),
    firstQuestion: c.turns[0]?.question ?? '',
    messageCount: c.turns.length * 2,
    lastMessageAt: last?.at ?? c.startedAt,
    unanswered: last ? (last.unanswered ?? last.kind === 'fallback') : false,
  };
}

export function ownToDetail(c: DemoConversation): V1ConversationDetail {
  const id = ownConversationId(c);
  return {
    thread: { id, firstQuestion: c.turns[0]?.question ?? '', status: 'open', createdAt: c.startedAt },
    messages: c.turns.flatMap((t, k) => [
      { id: `${id}-${k}-u`, role: 'user' as const, content: t.question, kind: null, createdAt: t.at, sources: null },
      {
        id: `${id}-${k}-a`,
        role: 'assistant' as const,
        content: t.answer,
        kind: t.kind,
        createdAt: t.at,
        sources: t.sources.length > 0 ? t.sources : null,
      },
    ]),
  };
}
