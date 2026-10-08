// V1 Klantendashboard: gesprek als volledige pagina (directe link of refresh).
// Vanuit de lijst opent hetzelfde gesprek in het zijpaneel (@drawer/(.)[id]);
// beide gebruiken loadConversation + ConversationView, dus één markup en één
// query-pad.
//
// Auth: getSessionOrg → AUTH_FORBIDDEN / NEXT_REDIRECT (in loadConversation).
// Read via session-client (RLS): een thread van een andere org → notFound().

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { loadConversation } from '../_conversation/load';
import { ConversationView } from '../_conversation/conversation-view';

export const dynamic = 'force-dynamic';

export default async function V1GesprekDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadConversation(id);

  if (res.status === 'forbidden') {
    return (
      <div className="v1-page">
        <PageHeader title="Geen toegang" description="Je bent geen lid van deze organisatie." />
      </div>
    );
  }
  if (res.status === 'not_found') notFound();

  return (
    <div className="v1-page v1-page--narrow">
      <PageHeader
        title="Gesprek"
        description="Wat je bezoeker vroeg en wat je chatbot antwoordde."
        actions={
          <Link href="/v1/app/gesprekken" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
            <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
            Alle gesprekken
          </Link>
        }
      />
      <ConversationView detail={res.detail} isUnanswered={res.isUnanswered} questionForQA={res.questionForQA} />
    </div>
  );
}
