// V1 chatbot-settings — de write (gedeeld door de klant- en de admin-save).
//
// De merge gebeurt in de database (merge_chatbot_settings, migr 0028): één
// statement met een rij-lock, dus twee saves tegelijk overschrijven elkaars velden
// niet meer. De caller doet de autorisatie en levert een al gesanitizede patch en
// een org-scoped chatbot (getOrgChatbot). Alleen als de save iets verandert aan
// wat de engine krijgt, gaat de answer-cache leeg (zie answerInputsChanged).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '@/lib/errors/action';
import { purgeAnswerCache } from '@/lib/rag/ingest';
import { answerInputsChanged, mergeChatbotSettings, type V1ChatbotSettings } from './settings-config';

export async function writeChatbotSettingsPatch(
  svc: SupabaseClient,
  orgId: string,
  chatbot: { id: string; name: string },
  safePatch: Partial<V1ChatbotSettings>,
): Promise<V1ChatbotSettings> {
  const { data, error } = await svc.rpc('merge_chatbot_settings', {
    p_organization_id: orgId,
    p_chatbot_id: chatbot.id,
    p_patch: safePatch,
  });
  if (error) throw new Error(`chatbot-settings opslaan faalde: ${error.message}`);
  const row = (data as { old_settings: unknown; new_settings: unknown }[] | null)?.[0];
  if (!row) fail('NOT_FOUND', 'Deze organisatie heeft nog geen chatbot.');

  const before = mergeChatbotSettings(row.old_settings);
  const after = mergeChatbotSettings(row.new_settings);

  // Toon/taal/fallback zitten niet in de cache-key → zo'n wijziging propageert pas
  // ná een purge. Awaiten (geen fire-and-forget): serverless kan de runtime na de
  // response killen. Een gefaalde purge draait de save niet terug (best-effort).
  if (answerInputsChanged(before, after, chatbot.name)) {
    await purgeAnswerCache(svc, orgId, chatbot.id);
  }
  return after;
}
