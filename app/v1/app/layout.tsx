// V1 /app shell-layout — data-fetchende wrapper om alle /v1/app-pagina's.
//
// Haalt orgName + shell-counts + aandacht-signalen (stippen) op voor de zijbalk. Auth-keten:
//  1. getSessionOrg gooit NEXT_REDIRECT (geen sessie) of AppError('AUTH_FORBIDDEN')
//  2. De layout vangt ALLE fouten stil op en degradeert naar lege-props-shell
//  3. De page-level guard (getSessionOrg in de page) handelt de redirect af
//
// Zo redirect de layout NOOIT zelf — de page doet dat. De shell rendert altijd
// (leeg bij niet-ingelogd), wat Next.js streaming-SSR correct laat werken.
import '../../klantendashboard/klant.css';
import type { Metadata } from 'next';
import { getSessionOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/v1/server';
import { getOrgChatbot } from './rag-config';
import { getShellCounts } from '@/lib/v1/dashboard/shell-counts';
import { getAttentionSignals, NO_SIGNALS, type AttentionSignals } from '@/lib/v1/dashboard/attention';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { ShellFrame } from './_shell/shell-frame';

export const metadata: Metadata = {
  title: 'ChatManta · Klantendashboard',
  description: 'Beheer je chatbot, kennisbank en instellingen.',
};

export const dynamic = 'force-dynamic';

export default async function V1AppLayout({ children }: { children: React.ReactNode }) {
  // Defaults voor de lege-shell bij geen sessie / geen org / DB-fout.
  let orgName = '';
  let chatbotStatus: ChatbotStatus = 'concept';
  let unansweredCount = 0;
  let contactRequestsNewCount = 0;
  let contactRequestsEnabled = false;
  let signals: AttentionSignals = NO_SIGNALS;

  try {
    const { orgId } = await getSessionOrg();
    const supabase = await createClient();

    // Org-naam + chatbot parallel; de chatbot-resolve is nodig voor getShellCounts.
    const [orgRow, chatbot] = await Promise.all([
      supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
      getOrgChatbot(supabase, orgId),
    ]);

    orgName = (orgRow.data?.name as string | null) ?? '';

    if (chatbot) {
      const [counts, sig] = await Promise.all([
        getShellCounts(supabase, orgId, chatbot.id),
        getAttentionSignals(supabase, orgId, chatbot.id),
      ]);
      signals = sig;
      chatbotStatus = counts.chatbotStatus;
      unansweredCount = counts.unansweredCount;
      contactRequestsNewCount = counts.contactRequestsNewCount;
      contactRequestsEnabled = counts.contactRequestsEnabled;
    }
  } catch {
    // Degrade gracefully. NEXT_REDIRECT (geen sessie), AppError('AUTH_FORBIDDEN')
    // (geen org-lidmaatschap) en DB-fouten landen hier allemaal. De page's eigen
    // getSessionOrg-call gooit daarna wél de redirect — de shell is dan al
    // gerenderd met lege defaults, wat prima is voor streaming-SSR.
  }

  return (
    <ShellFrame
      orgName={orgName}
      chatbotStatus={chatbotStatus}
      unansweredCount={unansweredCount}
      showContactRequests={contactRequestsEnabled}
      contactRequestsCount={contactRequestsNewCount}
      signals={signals}
    >
      {children}
    </ShellFrame>
  );
}
