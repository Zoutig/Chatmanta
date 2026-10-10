'use client';

// Een gesprek dat de bezoeker zelf met de voorbeeldwidget voerde. Het staat
// alleen in zijn browser (demo-opslag), dus de server kan het niet renderen:
// tot de opslag gelezen is toont dit het laadskelet, daarna dezelfde
// ConversationView als bij de voorbeeldgesprekken.

import { EmptyState } from '@/app/v1/_ui/feedback';
import { useDemoConversations, useHydrated } from '@/lib/voorbeeld/demo-store';
import { ConversationSkeleton } from './conversation-skeleton';
import { ConversationView } from './conversation-view';
import { deriveConversation } from './load';
import { ownToDetail, storeIdFromRoute } from './own';

export function OwnConversation({ id }: { id: string }) {
  const hydrated = useHydrated();
  const list = useDemoConversations();
  if (!hydrated) return <ConversationSkeleton />;

  const storeId = storeIdFromRoute(id);
  const convo = list.find((c) => c.id === storeId);
  if (!convo || convo.turns.length === 0) {
    return <EmptyState>Dit gesprek staat niet (meer) in je browser.</EmptyState>;
  }
  return <ConversationView {...deriveConversation(ownToDetail(convo))} />;
}
