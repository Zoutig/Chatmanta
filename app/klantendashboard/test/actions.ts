'use server';

// V0 Klantendashboard — Test chatbot server action.
//
// Wraps runRagQueryStreaming en collecteert events tot een final ChatResponse,
// gescopeerd op de actieve org via cookie. Bewust geen streaming aan de UI —
// het Test-scherm in v0 toont alleen het eind-antwoord plus details. Bij V1
// (Phase 4) kan dit upgraden naar echte streaming als gewenst.

import {
  runRagQueryStreaming,
  type ChatResponse,
  type ChatSource,
} from '@/lib/v0/server/rag';
import { resolveBot } from '@/lib/v0/server/bots';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';

export type TestAnswerResult =
  | { ok: true; response: ChatResponse }
  | { ok: false; error: string };

export async function askTestQuestion(question: string): Promise<TestAnswerResult> {
  const q = question.trim();
  if (!q) return { ok: false, error: 'Vraag is leeg.' };
  if (q.length > 1000) return { ok: false, error: 'Vraag is te lang (max 1000 tekens).' };

  try {
    const activeOrg = await getActiveOrgFromCookies();
    const bot = resolveBot(undefined); // gebruikt LATEST_BOT_VERSION
    let final: ChatResponse | null = null;
    let answerStartSources: ChatSource[] = [];

    for await (const ev of runRagQueryStreaming({
      question: q,
      threshold: bot.similarityThreshold,
      enableRewrite: bot.enableRewriteByDefault,
      bot,
      organizationId: activeOrg.id,
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
