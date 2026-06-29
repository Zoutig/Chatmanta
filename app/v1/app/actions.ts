'use server';

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { runRagQuery } from '@/lib/rag/run-rag-query';
import { V1_RAG_DEFAULTS, getOrgChatbot } from './rag-config';
import { getChatbotSettings, buildV1ChatbotInputs } from './instellingen/settings-config';

export type AskV1Result =
  | { ok: true; answer: string; sources: { title: string }[]; kind: string }
  | { ok: false; error: 'NO_CHATBOT' | 'FORBIDDEN' | 'FAILED' };

export async function askV1(question: string): Promise<AskV1Result> {
  if (!question || question.trim().length === 0) return { ok: false, error: 'FAILED' };

  // SA-1: org NIET uit client-input/env — uit de getrouwde sessie. getSessionOrg
  // gooit AppError('AUTH_FORBIDDEN') bij geen-membership. Bij geen/verlopen sessie
  // gooit requireAuth een NEXT_REDIRECT (geen AppError) → laten propageren zodat de
  // client naar /v1/login gaat (spiegelt page.tsx; niet alles op FORBIDDEN mappen).
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') return { ok: false, error: 'FORBIDDEN' };
    throw e;
  }

  // createClient + chatbot-resolutie + de RAG-loop in één try: élke onverwachte
  // fout (DB/RLS-hapering op de chatbots-select, getOrgChatbot die throwt, engine-
  // fout) → nette FAILED i.p.v. een rejected promise die de UI op 'Bezig…' laat
  // hangen. NEXT_REDIRECT komt alleen uit getSessionOrg hierboven (al
  // afgehandeld + doorgegooid), niet uit dit blok.
  try {
    const supabase = await createClient(); // session-client → RLS afgedwongen
    const chatbot = await getOrgChatbot(supabase, orgId);
    if (!chatbot) return { ok: false, error: 'NO_CHATBOT' };

    const config = { ...V1_RAG_DEFAULTS, version: chatbot.bot_version };

    // Klant-settings → engine-overrides. Zonder deze stap negeert askV1 de
    // Instellingen-UI volledig (dode knoppen). Lezen onder de session-client (RLS);
    // de mapping is puur. tone/length/extraSystemInstructions/fallbackMessage gaan
    // naar runRagQuery; de persona krijgt de klant-naam. GK blijft bewust uit (geen
    // enableGeneralKnowledge meegegeven → config.generalKnowledgeEnabled=false wint).
    const settings = await getChatbotSettings(supabase, chatbot.id);
    const { overrides, persona } = buildV1ChatbotInputs(settings, chatbot.name);

    // Terminale StreamEvents dragen de volledige ChatResponse in `ev.response`.
    // 'replacement' (claim-regenerate / deterministische weiger) wint van een
    // eerdere answer-done. `answer` zit op alle drie ChatResponse-varianten;
    // `sources` alléén op 'answer'/'fallback' (NIET 'smalltalk') → `'sources' in r`.
    let final: { answer: string; sources: { title: string }[]; kind: string } | null = null;
    for await (const ev of runRagQuery(supabase, {
      question: question.trim(),
      threshold: config.similarityThreshold,
      enableRewrite: config.enableRewriteByDefault,
      config,
      persona,
      organizationId: orgId,
      chatbotId: chatbot.id,
      // Klant-settings → engine. tone/length expliciet (resolved uit toneOfVoice/
      // answerLength); chatbotOverrides levert extraSystemInstructions + custom
      // fallbackMessage + taal-directive. ChatbotPromptOverrides ⊇ RagChatbotOverrides
      // (structureel toewijsbaar — zelfde patroon als de V0-chat-adapter).
      tone: overrides.tone,
      length: overrides.length,
      chatbotOverrides: overrides,
      // Cache aan (PR-3 3a): lezen onder de RLS session-client, schrijven via de
      // service-role client (answer_cache is SELECT-only onder RLS).
      serviceClient: getV1ServiceRoleClient(),
    })) {
      if (
        ev.kind === 'answer-done' ||
        ev.kind === 'fallback' ||
        ev.kind === 'smalltalk' ||
        ev.kind === 'replacement'
      ) {
        const r = ev.response;
        final = {
          answer: r.answer,
          sources: 'sources' in r ? r.sources.map((s) => ({ title: s.filename ?? 'bron' })) : [],
          kind: r.kind,
        };
      }
    }
    if (!final) return { ok: false, error: 'FAILED' };
    return { ok: true, ...final };
  } catch (e) {
    console.error('[v1/askV1] RAG mislukt:', e);
    return { ok: false, error: 'FAILED' };
  }
}
