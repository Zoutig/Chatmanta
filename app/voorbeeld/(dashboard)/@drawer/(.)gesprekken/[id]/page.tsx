// Gesprek in het zijpaneel (onderschepte route). Zelfde loader als de volledige
// pagina gesprekken/[id]; alleen de omlijsting verschilt. Eigen gesprekken uit
// de voorbeeldwidget (id "eigen-…") komen client-side uit de demo-opslag.

import { EmptyState } from '@/app/v1/_ui/feedback';
import { loadConversation } from '@/app/voorbeeld/(dashboard)/gesprekken/_conversation/load';
import { ConversationView } from '@/app/voorbeeld/(dashboard)/gesprekken/_conversation/conversation-view';
import { OwnConversation } from '@/app/voorbeeld/(dashboard)/gesprekken/_conversation/own-conversation';
import { isOwnConversationId } from '@/app/voorbeeld/(dashboard)/gesprekken/_conversation/own';

export const dynamic = 'force-dynamic';

export default async function ConversationDrawerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isOwnConversationId(id)) return <OwnConversation id={id} />;
  const res = await loadConversation(id);

  if (res.status === 'forbidden') return <EmptyState>Je bent geen lid van deze organisatie.</EmptyState>;
  if (res.status === 'not_found') return <EmptyState>Dit gesprek bestaat niet (meer).</EmptyState>;
  return <ConversationView detail={res.detail} isUnanswered={res.isUnanswered} questionForQA={res.questionForQA} />;
}
