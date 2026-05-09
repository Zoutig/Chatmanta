// V0 streaming chat endpoint — NDJSON stream van events.
//
// Auth: relies on proxy.ts page-gate. Browser fetch from authenticated client
// passes the v0_auth cookie automatically; for V0 this is sufficient.
//
// Format: ndjson — één JSON object per regel, scheidings-token \n.
// Events: zie StreamEvent in lib/v0/server/rag.ts.

import { NextResponse } from 'next/server';
import {
  runRagQueryStreaming,
  type ChatHistoryTurn,
  type ChatResponse,
} from '@/lib/v0/server/rag';
import { resolveBot } from '@/lib/v0/server/bots';
import { logQuery } from '@/lib/v0/server/log';

export const runtime = 'nodejs';

// V0.3 doet tot ~6 LLM-calls + retrieval per vraag. Vercel default function
// timeout is 10s op Hobby — te kort voor v0.3 streaming. 60s is het Hobby
// max; ruim voor onze worst case (~10s).
export const maxDuration = 60;

type Body = {
  question?: unknown;
  threshold?: unknown;
  enableRewrite?: unknown;
  version?: unknown;
  history?: unknown;
};

function parseHistory(input: unknown): ChatHistoryTurn[] {
  if (!Array.isArray(input)) return [];
  const out: ChatHistoryTurn[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      // Hard cap per turn om enorme history-payloads te voorkomen.
      out.push({ role, content: content.slice(0, 4000) });
    }
  }
  return out.slice(-20); // server-side hard cap
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const question = typeof body.question === 'string' ? body.question : '';
  const threshold = typeof body.threshold === 'number' ? body.threshold : 0.4;
  const enableRewrite = body.enableRewrite !== false;
  const version = typeof body.version === 'string' ? body.version : '';
  const history = parseHistory(body.history);
  if (!question.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  const bot = resolveBot(version);
  const generator = runRagQueryStreaming({ question, threshold, enableRewrite, bot, history });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let finalResponse: ChatResponse | null = null;
      try {
        for await (const event of generator) {
          // Capture the final ChatResponse for logging.
          if (event.kind === 'smalltalk' || event.kind === 'fallback' || event.kind === 'answer-done') {
            finalResponse = event.response;
          }
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              kind: 'error',
              message: err instanceof Error ? err.message : 'unknown',
            }) + '\n',
          ),
        );
      } finally {
        controller.close();
      }
      // Fire-and-forget logging na het sluiten van de stream.
      if (finalResponse) {
        logQuery(question, finalResponse).catch(() => undefined);
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
