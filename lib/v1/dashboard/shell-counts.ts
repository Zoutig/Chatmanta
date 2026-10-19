// V1 shell-counts — badge-tellers + chatbot-status voor de sidebar/topbar.
//
// Reads via de caller-geleverde session-client (RLS afgedwongen); org + chatbot
// expliciet gefilterd (defense-in-depth). Geen service-role, geen writes.
// Geen 'server-only': importeerbaar vanuit de layout server-component direct.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { getUnansweredForOrg } from './unanswered';

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
 * unansweredCount    = open onbeantwoorde VRAGEN (laatste 30 dagen), gedeelde definitie
 *                      in unanswered-core.ts — zelfde getal als de werklijst
 *                      "Wist je chatbot niet" in Gesprekken
 * negativeFeedback   = feedback rijen rating='down' (laatste 30 dagen)
 * contactRequestsNew = contact_requests status='new' (alle, niet soft-deleted)
 * contactRequestsEnabled = chatbots.settings.contactRequestsEnabled
 * chatbotStatus      = 'live' bij ooit verkeer (query_log), anders 'testing' als er
 *                      included documents zijn, anders 'concept' (zelfde regel als
 *                      getV1OverviewMetrics, zodat zijbalk en Overzicht gelijk lopen)
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

  const [unanswered, negFeedbackRes, contactNewRes, docRes, chatbotRes, trafficRes] = await Promise.all([
    // Onbeantwoorde vragen: gedeelde definitie (per request gecachet, ook voor de pagina).
    getUnansweredForOrg(orgId, chatbotId),

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

    // Ooit verkeer gehad? → 'live' (spiegelt hasTraffic in metrics.ts).
    client
      .from('query_log')
      .select('id')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .limit(1),
  ]);

  const settings =
    chatbotRes.data?.settings != null && typeof chatbotRes.data.settings === 'object'
      ? (chatbotRes.data.settings as Record<string, unknown>)
      : {};

  const hasContent = (docRes.count ?? 0) > 0;
  const hasTraffic = (trafficRes.data?.length ?? 0) > 0;

  return {
    unansweredCount: unanswered.openCount,
    negativeFeedbackCount: negFeedbackRes.count ?? 0,
    contactRequestsNewCount: contactNewRes.count ?? 0,
    contactRequestsEnabled: settings.contactRequestsEnabled === true,
    chatbotStatus: hasTraffic ? 'live' : hasContent ? 'testing' : 'concept',
  };
}
