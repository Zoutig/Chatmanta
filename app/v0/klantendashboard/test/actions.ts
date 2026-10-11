'use server';

// V0 Klantendashboard — Test chatbot server action.
//
// Wraps runRagQueryStreaming en collecteert events tot een final ChatResponse,
// gescopeerd op de actieve org via cookie. Bewust geen streaming aan de UI —
// het Test-scherm in v0 toont alleen het eind-antwoord plus details. Bij V1
// (Phase 4) kan dit upgraden naar echte streaming als gewenst.

import {
  runRagQueryStreaming,
  type ChatHistoryTurn,
  type ChatResponse,
  type ChatSource,
} from '@/lib/v0/server/rag';
import { resolveBot } from '@/lib/v0/server/bots';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { buildChatbotOverrides } from '@/lib/v0/klantendashboard/server/build-chatbot-overrides';

export type TestAnswerResult =
  | { ok: true; response: ChatResponse }
  | { ok: false; error: string };

// Hard cap op de history-payload zodat een lange test-sessie geen overweldigende
// token-bill genereert. Spiegelt de cap in /api/v0/chat (parseHistory).
const MAX_TEST_HISTORY_TURNS = 20;
const MAX_TEST_HISTORY_CHARS_PER_TURN = 4000;

function sanitizeHistory(input: unknown): ChatHistoryTurn[] {
  if (!Array.isArray(input)) return [];
  const out: ChatHistoryTurn[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      out.push({ role, content: content.slice(0, MAX_TEST_HISTORY_CHARS_PER_TURN) });
    }
  }
  return out.slice(-MAX_TEST_HISTORY_TURNS);
}

export async function askTestQuestion(
  question: string,
  history?: ChatHistoryTurn[],
): Promise<TestAnswerResult> {
  const q = question.trim();
  if (!q) return { ok: false, error: 'Vraag is leeg.' };
  if (q.length > 1000) return { ok: false, error: 'Vraag is te lang (max 1000 tekens).' };

  try {
    const activeOrg = await getActiveOrgFromCookies();
    const bot = resolveBot(undefined); // gebruikt LATEST_BOT_VERSION
    // Q&A items voor de fast-path + chatbot-overrides (tone, fallbackMessage,
    // extraInstructions, ...) uit één v0_org_settings-read. Bij faal valt
    // getOrgSettings al stilletjes terug op mock-defaults; geen extra
    // error-handling nodig hier.
    const settings = await getOrgSettings(activeOrg.slug);
    const chatbotOverrides = buildChatbotOverrides(settings.chatbot);
    let final: ChatResponse | null = null;
    let answerStartSources: ChatSource[] = [];

    for await (const ev of runRagQueryStreaming({
      question: q,
      threshold: bot.similarityThreshold,
      enableRewrite: bot.enableRewriteByDefault,
      // Spiegel de org-toggle zodat het Test-scherm exact toont wat de live widget
      // doet — anders viel dit pad stil op de rag.ts-default (true).
      enableGeneralKnowledge: chatbotOverrides.answerGeneralKnowledge,
      bot,
      organizationId: activeOrg.id,
      history: sanitizeHistory(history),
      manualQAItems: settings.qa.filter((qa) => qa.active),
      chatbotOverrides,
    })) {
      if (ev.kind === 'smalltalk' || ev.kind === 'fallback' || ev.kind === 'answer-done') {
        final = ev.response;
        break;
      }
      if (ev.kind === 'answer-start') {
        answerStartSources = ev.sources;
      }
    }

    if (!final) {
      // Defensief: ook als de stream voortijdig sluit, leveren we wat we hebben.
      return {
        ok: false,
        error: 'Geen antwoord ontvangen.',
      };
    }
    // Patch sources in als final.kind = answer maar de stream sources via
    // answer-start kwamen en niet in answer-done staan.
    if (final.kind === 'answer' && (!final.sources || final.sources.length === 0)) {
      final = { ...final, sources: answerStartSources };
    }
    return { ok: true, response: final };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    return { ok: false, error: msg };
  }
}
