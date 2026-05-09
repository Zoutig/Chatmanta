// V0 streaming chat endpoint — NDJSON stream van events.
//
// Auth: relies on proxy.ts page-gate. Browser fetch from authenticated client
// passes the v0_auth cookie automatically; for V0 this is sufficient.
//
// Format: ndjson — één JSON object per regel, scheidings-token \n.
// Events: zie StreamEvent in lib/v0/server/rag.ts.

import { NextResponse } from 'next/server';
import { runRagQueryStreaming, type ChatResponse } from '@/lib/v0/server/rag';
import { resolveBot } from '@/lib/v0/server/bots';
import { logQuery } from '@/lib/v0/server/log';

export const runtime = 'nodejs';

type Body = {
  question?: unknown;
  threshold?: unknown;
  enableRewrite?: unknown;
  version?: unknown;
};

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
  if (!question.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  const bot = resolveBot(version);
  const generator = runRagQueryStreaming({ question, threshold, enableRewrite, bot });

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
