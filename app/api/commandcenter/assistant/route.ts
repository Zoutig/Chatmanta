// POST /api/commandcenter/assistant — Command Center chatbot turn-handler.
//
// Flow:
//   1. requireV0Auth()
//   2. Load of maak thread, append user-message
//   3. Bouw system + snapshot + history
//   4. Tool-loop (max 5 iteraties) met GPT-4o
//   5. Stream NDJSON-events naar de client en persist alle messages
//
// Events (één JSON object per regel):
//   {type:'thread', thread:{id,title}}     — gebeurt bij nieuwe thread
//   {type:'tool_call', id, name, args}
//   {type:'tool_result', tool_call_id, message_id, ok, item, undo_token?, error?}
//   {type:'text', content}                  — finale assistant-tekst
//   {type:'done', cost_usd, input_tokens, output_tokens}
//   {type:'error', message}

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import OpenAI from 'openai';

import { requireV0Auth } from '@/app/actions/_auth';
import { AppError } from '@/lib/errors/app-error';
import { costForModelUsd } from '@/lib/ai/llm';
import {
  appendMessage,
  createThread,
  getThread,
  listMessages,
} from '@/lib/commandcenter/server/assistant-threads';
import { buildAssistantContext, buildSystemPrompt, getTool } from '@/lib/commandcenter/server/assistant-context';
import { ASSISTANT_TOOL_SCHEMAS } from '@/lib/commandcenter/server/assistant-tools';
import { buildChatHistory, type ChatMsg } from '@/lib/commandcenter/server/assistant-history';
import type { AssistantToolCall } from '@/lib/commandcenter/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MODEL = 'gpt-4o';
const MAX_TOOL_ITERATIONS = 5;
const COST_WARN_USD = 0.20;

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AppError('INTERNAL', { message: 'OPENAI_API_KEY missing' });
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    await requireV0Auth();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { thread_id?: string; message?: string };
  try {
    body = (await req.json()) as { thread_id?: string; message?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const userMessage = body.message?.trim();
  if (!userMessage) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // 1. Resolve thread (load of nieuw)
  let thread = body.thread_id ? await getThread(body.thread_id) : null;
  const isNewThread = !thread;
  if (!thread) {
    thread = await createThread(userMessage);
  }
  const threadIdResolved: string = thread.id;

  // 2. Append user-message direct (zodat hij ook bij streaming crashes bewaard blijft)
  await appendMessage({
    threadId: threadIdResolved,
    role: 'user',
    content: userMessage,
  });

  // 3. Pre-load context + history (parallel)
  const [context, history] = await Promise.all([
    buildAssistantContext(),
    listMessages(threadIdResolved),
  ]);

  const systemPrompt = buildSystemPrompt(context);

  // Bouw initiële messages-array voor OpenAI.
  // history bevat al de zojuist toegevoegde user-message.
  // buildChatHistory repareert meteen eventuele dangling tool_calls / orphan
  // tool-rijen uit eerdere half-gepersisteerde turns (zie assistant-history.ts).
  const messages: ChatMsg[] = buildChatHistory(systemPrompt, history);

  // 4. NDJSON streaming
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      try {
        if (isNewThread) {
          emit({ type: 'thread', thread: { id: thread!.id, title: thread!.title } });
        }

        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const completion = await openai().chat.completions.create({
            model: MODEL,
            messages: messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            tools: ASSISTANT_TOOL_SCHEMAS,
            tool_choice: 'auto',
            stream: false,
          });

          const usage = completion.usage;
          if (usage) {
            totalInputTokens += usage.prompt_tokens ?? 0;
            totalOutputTokens += usage.completion_tokens ?? 0;
          }

          const choice = completion.choices[0];
          const assistantMsg = choice?.message;
          if (!assistantMsg) {
            emit({ type: 'error', message: 'OpenAI gaf geen response.' });
            break;
          }

          const toolCalls = (assistantMsg.tool_calls ?? []) as unknown as AssistantToolCall[];

          if (toolCalls.length > 0) {
            // Persist de assistant-turn met tool-calls (content is meestal null/leeg).
            await appendMessage({
              threadId: threadIdResolved,
              role: 'assistant',
              content: assistantMsg.content ?? null,
              toolCalls: toolCalls,
              model: MODEL,
              inputTokens: usage?.prompt_tokens ?? null,
              outputTokens: usage?.completion_tokens ?? null,
              costUsd: usage
                ? costForModelUsd(MODEL, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0)
                : null,
            });

            // Voeg de assistant-turn ook toe aan de in-memory messages voor de
            // volgende OpenAI-call.
            messages.push({
              role: 'assistant',
              content: assistantMsg.content ?? null,
              tool_calls: toolCalls,
            });

            // Voer alle tool-calls parallel uit en stream resultaten.
            // Elke callback vangt zijn eigen fout (DB-blip, gecancelde stream, …):
            // zo rejectt Promise.all nooit meer halverwege, en staat er na deze
            // batch gegarandeerd een tool-message per tool_call_id — nooit meer
            // een half-gepersisteerde (dangling) turn. Zie assistant-history.ts
            // voor de leespad-repair die dit als vangnet ook al zelf opvangt.
            await Promise.all(
              toolCalls.map(async (tc) => {
                try {
                  const tool = getTool(tc.function.name);
                  let parsedArgs: Record<string, unknown> = {};
                  try {
                    parsedArgs = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
                  } catch {
                    parsedArgs = {};
                  }

                  emit({ type: 'tool_call', id: tc.id, name: tc.function.name, args: parsedArgs });

                  const result = tool
                    ? await tool.execute(parsedArgs)
                    : { ok: false, error: `Onbekende tool: ${tc.function.name}` };

                  // Persist tool-result als 'tool'-message in DB
                  const stored = await appendMessage({
                    threadId: threadIdResolved,
                    role: 'tool',
                    content: null,
                    toolCallId: tc.id,
                    toolName: tc.function.name,
                    toolResult: result,
                  });

                  // Stuur ook naar de in-memory messages voor volgende OpenAI-call
                  messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: JSON.stringify(result),
                  });

                  // Emit naar client. Undo-token alleen voor write-tools met beforeState.
                  const isWrite = tool?.isWrite ?? false;
                  emit({
                    type: 'tool_result',
                    tool_call_id: tc.id,
                    message_id: stored.id,
                    name: tc.function.name,
                    ok: result.ok,
                    item: result.item,
                    error: result.error,
                    undo_token: isWrite && result.ok ? stored.id : undefined,
                  });
                } catch (toolErr) {
                  // Best-effort compensatie: garandeer alsnog een tool-message
                  // voor dit tool_call_id, ook als de happy-path body hierboven
                  // ergens faalde (DB-blip, gecancelde stream, tool.execute-throw).
                  const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
                  const fallback = { ok: false as const, error: `tool-uitvoering faalde: ${errMsg}` };
                  try {
                    await appendMessage({
                      threadId: threadIdResolved,
                      role: 'tool',
                      content: null,
                      toolCallId: tc.id,
                      toolName: tc.function.name,
                      toolResult: fallback,
                    });
                  } catch {
                    // DB onbereikbaar — leespad-repair (assistant-history.ts) vangt dit alsnog op.
                  }
                  messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: JSON.stringify(fallback),
                  });
                  try {
                    emit({
                      type: 'tool_result',
                      tool_call_id: tc.id,
                      name: tc.function.name,
                      ok: false,
                      error: errMsg,
                    });
                  } catch {
                    // Client is weg — niets meer te sturen.
                  }
                }
              }),
            );

            // Continue tool-loop
            continue;
          }

          // Geen tool-calls → finale antwoord
          const text = assistantMsg.content ?? '';
          await appendMessage({
            threadId: threadIdResolved,
            role: 'assistant',
            content: text,
            model: MODEL,
            inputTokens: usage?.prompt_tokens ?? null,
            outputTokens: usage?.completion_tokens ?? null,
            costUsd: usage
              ? costForModelUsd(MODEL, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0)
              : null,
          });

          emit({ type: 'text', content: text });

          const totalCost = costForModelUsd(MODEL, totalInputTokens, totalOutputTokens);
          if (totalCost > COST_WARN_USD) {
            console.warn(
              `[cc-assistant] turn duur: $${totalCost.toFixed(4)} (in=${totalInputTokens}, out=${totalOutputTokens})`,
            );
          }

          emit({
            type: 'done',
            cost_usd: totalCost,
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          });

          return; // Klaar — break gaat naar finally
        }

        // Max iteraties bereikt zonder finale tekst
        emit({
          type: 'error',
          message:
            `Tool-loop bereikte ${MAX_TOOL_ITERATIONS} iteraties zonder finale tekst — afgebroken.`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[cc-assistant]', message);
        emit({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
