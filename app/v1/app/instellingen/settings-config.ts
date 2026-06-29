// V1 chatbot-settings — pure config-laag (defaults + merge + engine-wiring mapping).
//
// Geen I/O, geen 'server-only': unit-testbaar én build-safe. Hergebruikt de pure
// V0-helpers buildChatbotOverrides + de ChatbotSettings-vorm (lib/v0/klantendashboard)
// — die zijn type-only/pure (géén server-only-import), dus app/v1 mag ze importeren
// zoals rag-config.ts resolveBot importeert. De grep-gate (lib/rag ⊄ lib/v0) raakt
// dit niet: dit is app/v1, geen lib/rag.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatbotSettings } from '@/lib/v0/klantendashboard/types';
import {
  buildChatbotOverrides,
  type ChatbotPromptOverrides,
} from '@/lib/v0/klantendashboard/server/build-chatbot-overrides';
import type { RagPersona } from '@/lib/rag/types';
import { buildV1Persona } from '../rag-config';
import { AppError } from '@/lib/errors/app-error';

// Default fallback-tekst (kopie van de engine-default). Bewust geïnlined i.p.v.
// geïmporteerd uit lib/rag/run-rag-query: dat bestand draagt `import 'server-only'`
// en zou deze pure, unit-testbare module daarmee onbruikbaar maken in node:test.
// Laat de klant dit veld leeg → de engine valt sowieso terug op zijn eigen
// FALLBACK_MESSAGE, dus drift tussen de twee strings is onschadelijk.
const DEFAULT_FALLBACK_MESSAGE =
  'Daar heb ik geen informatie over. Stel je vraag anders, of neem contact op met de organisatie.';

// Neutrale V1-default — één set i.p.v. de org-gekeyde V0-mock (die hangt aan de
// V0-sandbox-slugs). Een ontbrekend jsonb-veld valt hierop terug; lege strings
// (klant heeft bewust geleegd) blijven leeg. Alle ChatbotSettings-velden ingevuld
// zodat mergeChatbotSettings altijd een compleet object oplevert.
export const V1_DEFAULT_CHATBOT_SETTINGS: ChatbotSettings = {
  chatbotName: '',
  companyDescription: '',
  // Widget-only velden (niet getoond in de V1-UI) — defaults bewaard zodat het
  // type compleet is; de widget-milestone geeft ze pas een oppervlak.
  welcomeMessage: 'Hoi! Hoe kan ik je helpen?',
  starterQuestions: [],
  primaryLanguage: 'nl',
  autoDetectLanguage: true,
  toneOfVoice: 'personal',
  extraInstructions: '',
  answerLength: 'normal',
  mayMentionPrices: true,
  mayShareContact: true,
  sourceStrictness: 'normal',
  honestAboutUnknown: true,
  // GK blijft uit: de V1-engine pint generalKnowledgeEnabled=false en de UI toont
  // de toggle niet. Veld bestaat alleen omdat het type het vereist.
  answerGeneralKnowledge: false,
  fallbackMessage: DEFAULT_FALLBACK_MESSAGE,
  contactEmail: '',
  contactPhone: '',
  contactPageUrl: '',
  unknownAnswerMessage: '',
};

/**
 * Merge de opgeslagen jsonb over de V1-defaults. Ontbrekend veld → default (niet
 * een lege string); een aanwezig veld (ook lege string) wint. Defensief tegen
 * corrupte/niet-object jsonb (handmatige DB-edit) → volledige defaults.
 */
export function mergeChatbotSettings(raw: unknown): ChatbotSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...V1_DEFAULT_CHATBOT_SETTINGS };
  }
  return { ...V1_DEFAULT_CHATBOT_SETTINGS, ...(raw as Partial<ChatbotSettings>) };
}

/**
 * Lees chatbots.settings (onder de meegegeven client: session-client → RLS, of
 * service-role) en merge over de defaults. Caller heeft de chatbotId al org-scoped
 * geresolved (getOrgChatbot).
 */
export async function getChatbotSettings(
  client: SupabaseClient,
  chatbotId: string,
): Promise<ChatbotSettings> {
  const { data, error } = await client
    .from('chatbots')
    .select('settings')
    .eq('id', chatbotId)
    .maybeSingle();
  if (error) {
    throw new AppError('INTERNAL', { message: `chatbot-settings lezen faalde: ${error.message}` });
  }
  return mergeChatbotSettings(data?.settings);
}

/**
 * De engine-wiring-mapping: ChatbotSettings → wat askV1 aan runRagQuery doorgeeft.
 * Puur en los van I/O zodat het deterministisch testbaar is (de "askV1 bouwt de
 * juiste overrides"-assertie zonder LLM-call). buildChatbotOverrides levert
 * tone/length + extraSystemInstructions + fallbackMessage; de persona krijgt de
 * klant-gekozen naam (chatbotName) of valt terug op de chatbots.name uit de DB.
 */
export function buildV1ChatbotInputs(
  settings: ChatbotSettings,
  fallbackCompanyName: string,
): { overrides: ChatbotPromptOverrides; persona: RagPersona } {
  const overrides = buildChatbotOverrides(settings);
  const companyName = settings.chatbotName.trim() || fallbackCompanyName;
  return { overrides, persona: buildV1Persona(companyName) };
}
