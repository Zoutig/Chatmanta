'use server';

import { requireOrgMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/v1/server';
import { runRagQuery } from '@/lib/rag/run-rag-query';
import { V1_RAG_DEFAULTS, buildV1Persona, getOrgChatbot } from './rag-config';

export type AskV1Result =
  | { ok: true; answer: string; sources: { title: string }[]; kind: string }
  | { ok: false; error: 'CONFIG' | 'NO_CHATBOT' | 'FORBIDDEN' | 'FAILED' };

export async function askV1(question: string): Promise<AskV1Result> {
  const orgId = process.env.V1_SEED_ORG_ID;
  if (!orgId) return { ok: false, error: 'CONFIG' };
  if (!question || question.trim().length === 0) return { ok: false, error: 'FAILED' };

  // SA-1: org NIET uit client-input — uit de getrouwde sessie. requireOrgMember
  // gooit AppError('AUTH_FORBIDDEN') bij niet-lid (NEXT_REDIRECT bij geen sessie).
  try {
    await requireOrgMember(orgId);
  } catch {
    return { ok: false, error: 'FORBIDDEN' };
  }

  const supabase = await createClient(); // session-client → RLS afgedwongen
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) return { ok: false, error: 'NO_CHATBOT' };

  const config = { ...V1_RAG_DEFAULTS, version: chatbot.bot_version };
  const persona = buildV1Persona(chatbot.name);

  // Terminale StreamEvents dragen de volledige ChatResponse in `ev.response`.
  // 'replacement' (claim-regenerate / deterministische weiger) wint van een
  // eerdere answer-done. `answer` zit op alle drie ChatResponse-varianten;
  // `sources` alléén op 'answer'/'fallback' (NIET 'smalltalk') → `'sources' in r`.
  let final: { answer: string; sources: { title: string }[]; kind: string } | null = null;
  try {
    for await (const ev of runRagQuery(supabase, {
      question: question.trim(),
      threshold: config.similarityThreshold,
      enableRewrite: config.enableRewriteByDefault,
      config,
      persona,
      organizationId: orgId,
      chatbotId: chatbot.id,
      disableCache: true,
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
  } catch {
    return { ok: false, error: 'FAILED' };
  }
  if (!final) return { ok: false, error: 'FAILED' };
  return { ok: true, ...final };
}
