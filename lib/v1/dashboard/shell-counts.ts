// V1 shell-counts — badge-tellers + chatbot-status voor de sidebar/topbar.
//
// Reads via de caller-geleverde session-client (RLS afgedwongen); org + chatbot
// expliciet gefilterd (defense-in-depth). Geen service-role, geen writes.
// Geen 'server-only': importeerbaar vanuit de layout server-component direct.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';

export type ShellCounts = {
  unansweredCount: number;
  negativeFeedbackCount: number;
  contactRequestsNewCount: number;
  contactRequestsEnabled: boolean;
  chatbotStatus: ChatbotStatus;
};

/**
 * Haal alle badge-tellers + chatbot-status op in één parallelle ronde.
 * Faalveilig: bij een DB-hapering gaan de tellers terug op 0 en status op
 * 'concept' — de layout degradeert dan zonder crash.
 *
 * unansweredCount    = query_log rijen kind='fallback' (laatste 30 dagen)
 * negativeFeedback   = feedback rijen rating='down' (laatste 30 dagen)
 * contactRequestsNew = contact_requests status='new' (alle, niet soft-deleted)
 * contactRequestsEnabled = chatbots.settings.contactRequestsEnabled
 * chatbotStatus      = 'testing' als er included documents zijn, anders 'concept'
 */
export async function getShellCounts(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<ShellCounts> {
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const [unansweredRes, negFeedbackRes, contactNewRes, docRes, chatbotRes] = await Promise.all([
    // Onbeantwoorde vragen: query_log-rijen met kind='fallback' deze maand.
    client
      .from('query_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .eq('kind', 'fallback')
      .gte('created_at', sinceIso),

    // Negatieve feedback: thumbs-down deze maand.
    client
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .eq('rating', 'down')
      .gte('created_at', sinceIso),

    // Nieuwe contactverzoeken (alle, geen tijdvenster — inbox-logica).
    client
      .from('contact_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'new')
      .is('deleted_at', null),

    // Heeft de chatbot al opgenomen content? → 'testing' vs 'concept'.
    client
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .eq('included', true)
      .is('deleted_at', null),

    // contactRequestsEnabled uit chatbots.settings jsonb.
    client
      .from('chatbots')
      .select('settings')
      .eq('id', chatbotId)
      .maybeSingle(),
  ]);

  const settings =
    chatbotRes.data?.settings != null && typeof chatbotRes.data.settings === 'object'
      ? (chatbotRes.data.settings as Record<string, unknown>)
      : {};

  const hasContent = (docRes.count ?? 0) > 0;

  return {
    unansweredCount: unansweredRes.count ?? 0,
    negativeFeedbackCount: negFeedbackRes.count ?? 0,
    contactRequestsNewCount: contactNewRes.count ?? 0,
    contactRequestsEnabled: settings.contactRequestsEnabled === true,
    chatbotStatus: hasContent ? 'testing' : 'concept',
  };
}
