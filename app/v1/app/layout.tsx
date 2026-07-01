// V1 /app shell-layout — data-fetchende wrapper om alle /v1/app-pagina's.
//
// Haalt orgName + shell-counts op voor de sidebar/topbar. Auth-keten:
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
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { V1Sidebar } from './_shell/sidebar';
import { V1Topbar } from './_shell/topbar';
import { TweaksPanel } from '@/app/klantendashboard/components/tweaks/tweaks-panel';

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
  let negativeFeedbackCount = 0;
  let contactRequestsNewCount = 0;
  let contactRequestsEnabled = false;

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
      const counts = await getShellCounts(supabase, orgId, chatbot.id);
      chatbotStatus = counts.chatbotStatus;
      unansweredCount = counts.unansweredCount;
      negativeFeedbackCount = counts.negativeFeedbackCount;
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
    <div data-klant-scope className="klant-shell">
      <V1Sidebar
        unansweredCount={unansweredCount}
        showContactRequests={contactRequestsEnabled}
        contactRequestsCount={contactRequestsNewCount}
      />
      <V1Topbar
        orgName={orgName}
        chatbotStatus={chatbotStatus}
        unansweredCount={unansweredCount}
        negativeFeedbackCount={negativeFeedbackCount}
      />
      <main className="klant-main">{children}</main>
      <TweaksPanel />
    </div>
  );
}
