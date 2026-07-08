// Command Center-assistent — geschiedenis-reconstructie + zelf-herstel.
//
// buildChatHistory() zet de opgeslagen thread-rijen om in de OpenAI-messages-
// array én repareert beide invaliditeits-richtingen zodat een halve write
// (assistant-turn met tool_calls zónder alle bijbehorende tool-resultaten)
// een thread niet permanent brickt. Zie route.ts voor de aanroep.

import 'server-only';

import type { AssistantMessage, AssistantToolCall } from '../types';

// ---------------------------------------------------------------------------
// OpenAI message-types — los van de SDK omdat we ze ook serialiseren/casten.
// ---------------------------------------------------------------------------

export type ChatMsg =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: AssistantToolCall[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

/**
 * Bouwt de OpenAI-messages-array uit de opgeslagen thread-geschiedenis en
 * repareert beide invaliditeits-richtingen:
 * 1. "Dangling" tool_calls: voor elke assistant-turn met tool_calls waarvan een
 *    tool_call_id géén tool-message heeft, wordt direct ná die assistant-turn een
 *    placeholder-tool-message ingevoegd (anders OpenAI-400, thread bricked).
 * 2. Orphan-tool-rijen: een tool-message waarvan het tool_call_id in géén enkele
 *    assistant-turn is aangekondigd wordt gedropt (óók een OpenAI-400). Vandaag
 *    onbereikbaar — vangnet-laag.
 */
export function buildChatHistory(system: string, history: AssistantMessage[]): ChatMsg[] {
  const out: ChatMsg[] = [{ role: 'system', content: system }];

  const answered = new Set(
    history.filter((h) => h.role === 'tool' && h.toolCallId).map((h) => h.toolCallId as string),
  );
  const called = new Set(
    history.flatMap((h) => (h.role === 'assistant' && h.toolCalls ? h.toolCalls.map((c) => c.id) : [])),
  );

  for (const m of history) {
    if (m.role === 'user' && m.content) {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const calls = m.toolCalls ?? undefined;
      out.push({ role: 'assistant', content: m.content, tool_calls: calls });
      if (calls && calls.length > 0) {
        for (const c of calls) {
          if (!answered.has(c.id)) {
            out.push({
              role: 'tool',
              tool_call_id: c.id,
              content: JSON.stringify({ ok: false, error: 'tool-resultaat verloren gegaan' }),
            });
          }
        }
      }
    } else if (m.role === 'tool' && m.toolCallId && called.has(m.toolCallId)) {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: JSON.stringify(m.toolResult ?? { ok: false, error: 'missing result' }),
      });
    }
  }

  return out;
}
