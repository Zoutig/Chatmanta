// Gesprek in het zijpaneel (onderschepte route). Zelfde loader en auth-keten als
// de volledige pagina gesprekken/[id]; alleen de omlijsting verschilt.

import { EmptyState } from '@/app/v1/_ui/feedback';
import { loadConversation } from '@/app/v1/app/gesprekken/_conversation/load';
import { ConversationView } from '@/app/v1/app/gesprekken/_conversation/conversation-view';

export const dynamic = 'force-dynamic';

export default async function ConversationDrawerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadConversation(id);

  if (res.status === 'forbidden') return <EmptyState>Je bent geen lid van deze organisatie.</EmptyState>;
  if (res.status === 'not_found') return <EmptyState>Dit gesprek bestaat niet (meer).</EmptyState>;
  return <ConversationView detail={res.detail} isUnanswered={res.isUnanswered} questionForQA={res.questionForQA} />;
}
