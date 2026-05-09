// V0 query logger — append-only insert in public.query_log.
//
// Failure-mode: NEVER throw. Logging is een leeranalyse-laag, geen kritiek
// pad. Als de insert faalt (DB down, schema-mismatch, etc.) loggen we naar
// console en gaan door zodat de gebruiker zijn antwoord nog krijgt.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEV_ORG_ID } from './rag';
import type { ChatResponse } from './rag';

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

type QueryLogRow = {
  organization_id: string;
  bot_version: string;
  kind: 'smalltalk' | 'answer' | 'fallback';
  question: string;
  rewritten: string | null;
  threshold: number | null;
  top_similarity: number | null;
  source_count: number;
  answer: string;
  embed_tokens: number;
  chat_in_tokens: number;
  chat_out_tokens: number;
  pre_in_tokens: number;
  pre_out_tokens: number;
  cost_usd: number;
};

/**
 * All-time usage totalen voor de DEV_ORG, gelezen uit query_log.
 *
 * Gebruikt door de sidebar footer ("hoeveel tokens / cost ben ik kwijt sinds
 * we deze setup hebben"). Voor V0 is het corpus klein genoeg dat we alle rijen
 * binnen halen en client-side optellen — een paar honderd queries kost ms.
 * Bij V1 verhuist dit naar een aggregate-RPC of materialized view.
 */
export type AllTimeUsage = {
  queryCount: number;
  totalCostUsd: number;
  embedTokens: number;
  chatInputTokens: number;
  chatOutputTokens: number;
  preTokens: number; // pre_in + pre_out (rewrite/preprocess)
  totalTokens: number;
};

export async function getAllTimeUsage(): Promise<AllTimeUsage> {
  const empty: AllTimeUsage = {
    queryCount: 0,
    totalCostUsd: 0,
    embedTokens: 0,
    chatInputTokens: 0,
    chatOutputTokens: 0,
    preTokens: 0,
    totalTokens: 0,
  };
  try {
    const { data, error } = await sb()
      .from('query_log')
      .select(
        'embed_tokens, chat_in_tokens, chat_out_tokens, pre_in_tokens, pre_out_tokens, cost_usd',
      )
      .eq('organization_id', DEV_ORG_ID);
    if (error || !data) return empty;
    return data.reduce<AllTimeUsage>((acc, r) => {
      const embed = Number(r.embed_tokens) || 0;
      const chatIn = Number(r.chat_in_tokens) || 0;
      const chatOut = Number(r.chat_out_tokens) || 0;
      const preIn = Number(r.pre_in_tokens) || 0;
      const preOut = Number(r.pre_out_tokens) || 0;
      const cost = Number(r.cost_usd) || 0;
      acc.queryCount += 1;
      acc.embedTokens += embed;
      acc.chatInputTokens += chatIn;
      acc.chatOutputTokens += chatOut;
      acc.preTokens += preIn + preOut;
      acc.totalTokens += embed + chatIn + chatOut + preIn + preOut;
      acc.totalCostUsd += cost;
      return acc;
    }, empty);
  } catch {
    // Failure-mode net als logQuery: geen blocker, gewoon nullen tonen.
    return empty;
  }
}

export async function logQuery(
  question: string,
  response: ChatResponse,
): Promise<void> {
  try {
    const row: QueryLogRow =
      response.kind === 'smalltalk'
        ? {
            organization_id: DEV_ORG_ID,
            bot_version: response.botVersion,
            kind: 'smalltalk' as const,
            question,
            rewritten: null,
            threshold: null,
            top_similarity: null,
            source_count: 0,
            answer: response.answer,
            embed_tokens: 0,
            chat_in_tokens: 0,
            chat_out_tokens: 0,
            pre_in_tokens: response.preProcessTokens.in,
            pre_out_tokens: response.preProcessTokens.out,
            cost_usd: response.totalCostUsd,
          }
        : {
            organization_id: DEV_ORG_ID,
            bot_version: response.botVersion,
            kind: response.kind,
            question,
            rewritten: response.rewrite?.rewritten ?? null,
            threshold: response.threshold,
            top_similarity:
              response.kind === 'fallback'
                ? response.topSimilarity
                : (response.sources[0]?.similarity ?? null),
            source_count: response.sources.length,
            answer: response.answer,
            embed_tokens: response.embedTokens,
            chat_in_tokens: response.kind === 'answer' ? response.chatInputTokens : 0,
            chat_out_tokens: response.kind === 'answer' ? response.chatOutputTokens : 0,
            pre_in_tokens: response.rewrite?.inputTokens ?? 0,
            pre_out_tokens: response.rewrite?.outputTokens ?? 0,
            cost_usd: response.totalCostUsd,
          };

    const { error } = await sb().from('query_log').insert(row);
    if (error) console.error('[query_log] insert failed:', error.message);
  } catch (err) {
    console.error('[query_log] unexpected error:', err);
  }
}
