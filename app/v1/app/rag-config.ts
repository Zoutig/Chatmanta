// V1-RAG-glue: config + persona + chatbot-resolutie voor het /v1/app-pad.
// Geen lib/rag-neutraliteits-issue: dit bestand woont in app/v1 (buiten de
// grep-gate die alleen lib/rag ⊄ lib/v0 afdwingt) en wordt enkel door
// server-code geïmporteerd (page + 'use server' action).

import type { RagConfig, RagPersona } from '@/lib/rag/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBot, LATEST_BOT_VERSION } from '@/lib/v0/server/bots';

// ponytail: V1's default RAG-config = de bewezen LATEST V0-bot + V1-specifieke
// vlaggen, i.p.v. 38 velden + getunede anti-hallucinatie-prompts opnieuw te
// schrijven. bots.ts is pure config-data (alléén `import type { RagConfig }`),
// dus build-safe om hier te importeren. Ceiling: dit koppelt V1's default aan de
// V0-registry. Opwaardeerpad: per-chatbot-config uit de chatbots-rij in een
// latere PR → dan vervalt de lib/v0/server/bots-import.
const V1_OVERRIDES = {
  version: 'v1.0',
  label: 'V1',
  description: 'V1 RAG document-only chatbot-scoped (PR-1b)',
  similarityThreshold: 0.4,
  chatbotScoped: true,
  hybridSearch: false,
  parentDocumentRetrieval: true,
  // PR-3 3a: answer_cache + chatbot_id-key live in V1. Lezen onder de session-
  // client (RLS SELECT); schrijven via een service-role client die askV1
  // injecteert (answer_cache is SELECT-only onder RLS).
  cacheEnabled: true,
  // PR-3b: website-documents dragen nu source_url (de match-RPC geeft
  // d.metadata->>'source_url' terug) → bronlinks aan. Document-only orgs hebben
  // source_url null → de sanitizer maakt er gewoon platte tekst van (geen link).
  sourceLinksEnabled: true,
  generalKnowledgeEnabled: false,
} satisfies Partial<RagConfig>;

export const V1_RAG_DEFAULTS: RagConfig = {
  ...resolveBot(LATEST_BOT_VERSION),
  ...V1_OVERRIDES,
};

/**
 * Bouw een volledige RagPersona voor een V1-chatbot. Alle 10 velden ingevuld —
 * een ontbrekend veld zou als letterlijke {{TOKEN}} in de prompt belanden
 * (renderPersonaTemplate laat onbekende placeholders staan). PR-1b: een
 * generiek-professionele NL-persona afgeleid van de chatbot/bedrijfsnaam.
 */
export function buildV1Persona(company: string): RagPersona {
  return {
    company,
    companySuffix: '',
    audience: `bezoekers en klanten van ${company}`,
    citationExample1: 'Volgens de informatie op onze website ...',
    citationExample2: 'Zoals vermeld in onze documentatie ...',
    smalltalkGreeting: `Hoi! Leuk dat je er bent. Waarmee kan ik je helpen namens ${company}?`,
    smalltalkHelpScope: `vragen over ${company} — onze diensten, openingstijden, producten en contactgegevens`,
    domainKeywords: ['openingstijden', 'diensten', 'producten', 'contact', 'locatie'],
    generalKnowledgeClosing: ` Wil je hier meer over weten? Vraag gerust.`,
    offTopicScope: `${company} en aanverwante onderwerpen`,
  };
}

/**
 * Resolveer de enige actieve chatbot van een org (één-per-org-automatisch).
 * Onder de session-client geldt RLS + chatbots_select_org_members; onder
 * service-role ziet hij alle chatbots van de org. null = geen chatbot → de
 * caller faalt expliciet (nooit een lege chatbotId naar de NOT-NULL-RPC).
 */
export async function getOrgChatbot(
  client: SupabaseClient,
  orgId: string,
): Promise<{ id: string; name: string; bot_version: string } | null> {
  const { data, error } = await client
    .from('chatbots')
    .select('id, name, bot_version')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}
