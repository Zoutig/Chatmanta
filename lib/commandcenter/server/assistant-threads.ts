// Command Center Assistant — thread + message storage layer.
//
// Patroon spiegelt lib/commandcenter/server/storage.ts: lokale service-role
// singleton. Geen RLS (zie migration 0028 header) — access loopt langs
// requireV0Auth() in alle callers.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AssistantMessage,
  AssistantRole,
  AssistantThread,
  AssistantToolCall,
  AssistantToolResult,
} from '../types';

let _sb: SupabaseClient | null = null;

function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Assistant storage requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type ThreadRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  role: AssistantRole;
  content: string | null;
  tool_calls: AssistantToolCall[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_result: AssistantToolResult | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | string | null;
  created_at: string;
};

function rowToThread(r: ThreadRow): AssistantThread {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  };
}

function rowToMessage(r: MessageRow): AssistantMessage {
  return {
    id: r.id,
    threadId: r.thread_id,
    role: r.role,
    content: r.content,
    toolCalls: r.tool_calls,
    toolCallId: r.tool_call_id,
    toolName: r.tool_name,
    toolResult: r.tool_result,
    model: r.model,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    // Supabase serializes numeric() as string; normaliseer naar number.
    costUsd: r.cost_usd == null ? null : Number(r.cost_usd),
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

// Hard cap op het aantal actieve (non-archived) threads. Bij het aanmaken
// van een nieuwe thread wordt teruggesnoeid naar dit aantal zodat we nooit
// meer dan MAX_ACTIVE_THREADS in de DB hebben staan na een create.
export const MAX_ACTIVE_THREADS = 3;

function truncateTitle(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) return trimmed || 'Nieuwe chat';
  return trimmed.slice(0, 57) + '...';
}

// Verwijdert de oudste actieve threads zodat er hooguit `keep` overblijven.
// Sorteert op updated_at ASC (oudste eerst) en delete in één call via .in().
async function pruneToMax(keep: number): Promise<void> {
  const { data, error } = await sb()
    .from('cc_assistant_threads')
    .select('id, updated_at')
    .is('archived_at', null)
    .order('updated_at', { ascending: true });
  if (error) throw new Error(`pruneToMax list failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length <= keep) return;
  const toDelete = rows.slice(0, rows.length - keep).map((r) => r.id as string);
  const { error: delErr } = await sb()
    .from('cc_assistant_threads')
    .delete()
    .in('id', toDelete);
  if (delErr) throw new Error(`pruneToMax delete failed: ${delErr.message}`);
}

export async function createThread(titleHint: string): Promise<AssistantThread> {
  const title = truncateTitle(titleHint);
  // Ruimte maken vóór insert zodat we na de insert exact MAX_ACTIVE_THREADS hebben.
  await pruneToMax(MAX_ACTIVE_THREADS - 1);
  const { data, error } = await sb()
    .from('cc_assistant_threads')
    .insert({ title })
    .select('*')
    .single();
  if (error) throw new Error(`createThread failed: ${error.message}`);
  return rowToThread(data as ThreadRow);
}

export async function listThreads(opts: { includeArchived?: boolean } = {}): Promise<AssistantThread[]> {
  let query = sb()
    .from('cc_assistant_threads')
    .select('*')
    .order('updated_at', { ascending: false });
  if (!opts.includeArchived) {
    query = query.is('archived_at', null);
  }
  const { data, error } = await query;
  if (error) throw new Error(`listThreads failed: ${error.message}`);
  return (data ?? []).map((r) => rowToThread(r as ThreadRow));
}

export async function getThread(id: string): Promise<AssistantThread | null> {
  const { data, error } = await sb()
    .from('cc_assistant_threads')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getThread failed: ${error.message}`);
  return data ? rowToThread(data as ThreadRow) : null;
}

export async function renameThread(id: string, title: string): Promise<AssistantThread> {
  const clean = truncateTitle(title);
  const { data, error } = await sb()
    .from('cc_assistant_threads')
    .update({ title: clean })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`renameThread failed: ${error.message}`);
  return rowToThread(data as ThreadRow);
}

export async function archiveThread(id: string): Promise<void> {
  const { error } = await sb()
    .from('cc_assistant_threads')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`archiveThread failed: ${error.message}`);
}

export async function deleteThread(id: string): Promise<void> {
  const { error } = await sb().from('cc_assistant_threads').delete().eq('id', id);
  if (error) throw new Error(`deleteThread failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type AppendMessageInput = {
  threadId: string;
  role: AssistantRole;
  content?: string | null;
  toolCalls?: AssistantToolCall[] | null;
  toolCallId?: string | null;
  toolName?: string | null;
  toolResult?: AssistantToolResult | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
};

export async function appendMessage(input: AppendMessageInput): Promise<AssistantMessage> {
  const row = {
    thread_id: input.threadId,
    role: input.role,
    content: input.content ?? null,
    tool_calls: input.toolCalls ?? null,
    tool_call_id: input.toolCallId ?? null,
    tool_name: input.toolName ?? null,
    tool_result: input.toolResult ?? null,
    model: input.model ?? null,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    cost_usd: input.costUsd ?? null,
  };
  const { data, error } = await sb()
    .from('cc_assistant_messages')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`appendMessage failed: ${error.message}`);
  return rowToMessage(data as MessageRow);
}

export async function listMessages(threadId: string): Promise<AssistantMessage[]> {
  const { data, error } = await sb()
    .from('cc_assistant_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listMessages failed: ${error.message}`);
  return (data ?? []).map((r) => rowToMessage(r as MessageRow));
}

export async function getMessage(id: string): Promise<AssistantMessage | null> {
  const { data, error } = await sb()
    .from('cc_assistant_messages')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getMessage failed: ${error.message}`);
  return data ? rowToMessage(data as MessageRow) : null;
}

/** Markeer een tool-message als ongedaan-gemaakt (undo-flow). */
export async function markMessageUndone(id: string): Promise<void> {
  const existing = await getMessage(id);
  if (!existing) throw new Error(`markMessageUndone: message ${id} not found`);
  const newResult: AssistantToolResult = {
    ...(existing.toolResult ?? { ok: true }),
    undone: true,
  };
  const { error } = await sb()
    .from('cc_assistant_messages')
    .update({ tool_result: newResult })
    .eq('id', id);
  if (error) throw new Error(`markMessageUndone failed: ${error.message}`);
}
