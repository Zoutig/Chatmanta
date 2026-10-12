// Gedeelde V1-widget-chatpijplijn: injectie-gate, chatbot-resolutie, pauze, org-gates,
// klant-settings, config en de runRagQuery-aanroep van /api/v1/chat op één plek. De
// route én de eval-suite (plan 016) draaien deze functies, zodat een eval exact het
// widget-pad meet en niet een nagebouwde kopie die uit de pas loopt.
//
// Wat hier NIET in zit (blijft in de route): per-IP rate-limit, embed-token + origin-
// lock, slug → org-resolutie (= de auth-grens), body-parse, NDJSON-stream, logRagQuery
// en de transcript-write. De eval roept dus nooit iets aan dat schrijft.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  runRagQuery,
  type ChatResponse,
  type ChatHistoryTurn,
  type StreamEvent,
} from '@/lib/rag/run-rag-query';
import type { RagConfig, RagPersona } from '@/lib/rag/types';
// TODO(V2): graduate detectInjection to a neutral lib/rag detector to drop the lib/v0 import.
import { detectInjection, INJECTION_BLOCKED_MESSAGE } from '@/lib/v0/server/injection';
import { checkOrgChatGates } from '@/lib/v1/limits/chat-gates';
import { getOrgFastMode, applyFastMode } from '@/lib/v1/limits/fast-mode';
import { v1RagConfigFor, getOrgChatbot, buildV1Persona } from '@/app/v1/app/rag-config';
import { getChatbotSettings, buildV1ChatbotInputs } from '@/app/v1/app/instellingen/settings-config';
import type { ChatbotPromptOverrides } from '@/lib/v0/klantendashboard/server/build-chatbot-overrides';

/** Eén terminale fallback zonder pipeline (injectie, pauze, limiet). */
export type V1TerminalEvent = { kind: 'fallback'; response: { kind: 'fallback'; answer: string } };

const terminal = (answer: string): V1TerminalEvent => ({
  kind: 'fallback',
  response: { kind: 'fallback', answer },
});

export const V1_PAUSED_MESSAGE =
  'Deze chatbot is tijdelijk gepauzeerd. Probeer het later opnieuw of neem rechtstreeks contact op.';

/**
 * Prompt-injection gate — het publieke widget-pad blokkeert injectie ALTIJD, vóór
 * enige pipeline/DB-call. null = doorgaan.
 */
export function v1InjectionBlock(question: string): V1TerminalEvent | null {
  return detectInjection(question).detected ? terminal(INJECTION_BLOCKED_MESSAGE) : null;
}

type Chatbot = NonNullable<Awaited<ReturnType<typeof getOrgChatbot>>>;

export type V1WidgetChat =
  | { kind: 'no-chatbot' }
  | { kind: 'terminal'; reason: 'paused' | 'gated'; event: V1TerminalEvent }
  | {
      kind: 'run';
      chatbot: Chatbot;
      /** De effectieve config (na fast mode) — de eval legt hem vast per antwoord. */
      config: RagConfig;
      generator: AsyncGenerator<StreamEvent, void, void>;
    };

export type V1WidgetChatInput = {
  organizationId: string;
  question: string;
  history: ChatHistoryTurn[];
  /**
   * EVAL-ONLY: 'skip' slaat checkOrgChatGates over (per-org rate-limit + limieten
   * lezen query_log, waar de eval nooit naar schrijft). Default 'enforce'.
   */
  orgGates?: 'enforce' | 'skip';
  /** EVAL-ONLY: meet deze V0-botversie op het V1-pad i.p.v. LATEST (zie v1BotConfig). */
  botVersion?: string;
  /** EVAL-ONLY: doorgegeven aan runRagQuery (cache uit, volledige bronnen, prompt-capture). */
  evalOptions?: {
    disableCache?: boolean;
    includeFullParentContent?: boolean;
    onAnswerPrompt?: Parameters<typeof runRagQuery>[1]['onAnswerPrompt'];
  };
};

/**
 * Stap 4-7 van /api/v1/chat: chatbot, pauze, org-gates, settings, config, run.
 * `svc` = V1-service-role client; org komt uit de gesigneerde slug (route) of uit
 * de eval-config — nooit uit rauwe client-input.
 */
export async function prepareV1WidgetChat(
  svc: SupabaseClient,
  input: V1WidgetChatInput,
): Promise<V1WidgetChat> {
  const { organizationId } = input;

  let chatbot: Chatbot | null = null;
  try {
    chatbot = await getOrgChatbot(svc, organizationId);
  } catch {
    chatbot = null;
  }
  if (!chatbot) return { kind: 'no-chatbot' };
  const activeChatbot = chatbot;

  // Klant-pauze (chatbots.is_active). Defense in depth naast de embed-render-gate.
  if (activeChatbot.is_active === false) {
    return { kind: 'terminal', reason: 'paused', event: terminal(V1_PAUSED_MESSAGE) };
  }

  // Per-org gate (rate-limit + maand-cap + dag-budget) parallel met de fast-mode-read
  // (eigen fail-safe → standaard tier bij een fout).
  const [gate, fastMode] = await Promise.all([
    input.orgGates === 'skip'
      ? Promise.resolve({ ok: true } as const)
      : checkOrgChatGates(svc, organizationId),
    getOrgFastMode(svc, organizationId),
  ]);
  if (!gate.ok) {
    return { kind: 'terminal', reason: 'gated', event: terminal(gate.message) };
  }

  // Klant-settings → engine-overrides. Bij een settings-read-fout draaien we door op
  // de default-persona zonder overrides (de chat mag niet falen op een hapering).
  let overrides: ChatbotPromptOverrides | undefined;
  let persona: RagPersona;
  try {
    const settings = await getChatbotSettings(svc, activeChatbot.id);
    ({ overrides, persona } = buildV1ChatbotInputs(settings, activeChatbot.name));
  } catch {
    overrides = undefined;
    persona = buildV1Persona(activeChatbot.name);
  }

  // Config — widget-override: sourceLinksEnabled UIT (document-only RPC). Fast mode
  // per org (organizations.fast_mode_enabled): uit → standaard tier.
  //    Index-versie per chatbot (migr 0030): de zoekvraag moet met het model van de index.
  const config = applyFastMode(
    { ...v1RagConfigFor(activeChatbot, input.botVersion), sourceLinksEnabled: false },
    fastMode,
  );

  // GK blijft fail-closed (geen enableGeneralKnowledge → config wint). Cache
  // leest+schrijft via svc, tenzij de eval disableCache zet.
  const generator = runRagQuery(svc, {
    question: input.question.trim(),
    threshold: config.similarityThreshold,
    enableRewrite: config.enableRewriteByDefault,
    config,
    persona,
    organizationId,
    chatbotId: activeChatbot.id,
    history: input.history,
    tone: overrides?.tone,
    length: overrides?.length,
    chatbotOverrides: overrides,
    serviceClient: svc,
    ...input.evalOptions,
  });

  return { kind: 'run', chatbot: activeChatbot, config, generator };
}

/**
 * Vouw een stream-event in de eind-response (wat de bezoeker uiteindelijk zag, plus
 * kosten van de vervolgvragen en de fase-timings). Spiegelt askV1 + app/api/v0/chat.
 */
export function foldV1FinalResponse(
  finalResponse: ChatResponse | null,
  event: StreamEvent,
): ChatResponse | null {
  if (
    event.kind === 'smalltalk' ||
    event.kind === 'fallback' ||
    event.kind === 'answer-done' ||
    event.kind === 'replacement'
  ) {
    return event.response;
  }
  if (event.kind === 'followups-done' && finalResponse?.kind === 'answer') {
    return {
      ...finalResponse,
      chatInputTokens: finalResponse.chatInputTokens + event.inputTokens,
      chatOutputTokens: finalResponse.chatOutputTokens + event.outputTokens,
      totalCostUsd: finalResponse.totalCostUsd + event.costUsd,
      extras: {
        ...(finalResponse.extras ?? {}),
        ...(event.followUps.length > 0 ? { followUps: event.followUps } : {}),
      },
    };
  }
  if (event.kind === 'metrics-done' && finalResponse?.kind === 'answer') {
    return {
      ...finalResponse,
      extras: { ...(finalResponse.extras ?? {}), phaseTimingsMs: event.phaseTimingsMs },
    };
  }
  return finalResponse;
}
