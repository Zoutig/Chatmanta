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
import { logQuery, logBlockedQuery } from '@/lib/v0/server/log';
import { normalizeStyle } from '@/lib/v0/style';
import { detectInjection, getInjectionMode, INJECTION_BLOCKED_MESSAGE } from '@/lib/v0/server/injection';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';
import { getActiveOrgId } from '@/lib/v0/server/active-org';

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
  tone?: unknown;
  length?: unknown;
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
  // v0.4 security gate #1 — rate limit per IP. Faalt door als bucket overstroomt.
  const ip = getClientIp(req);
  const rl = getRateLimiter().check(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate limit exceeded', retryAfterSec: rl.retryAfterSec },
      {
        status: 429,
        headers: {
          'Retry-After': String(rl.retryAfterSec),
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)),
        },
      },
    );
  }

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
  const { tone, length } = normalizeStyle({ tone: body.tone, length: body.length });
  if (!question.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  const bot = resolveBot(version);

  // v0.4 security gate #2 — prompt-injection detector.
  // 'log-only' mode (default): we registreren de match en gaan door.
  // 'block' mode: we wijzen de query af met INJECTION_BLOCKED_MESSAGE.
  const injection = detectInjection(question);
  const injectionMode = getInjectionMode();

  if (injection.detected && injectionMode === 'block') {
    const patternName = injection.pattern?.name ?? 'unknown';
    // Fire-and-forget log — niet blocking voor de user response.
    logBlockedQuery({
      question,
      botVersion: bot.version,
      tone,
      length,
      injectionPattern: patternName,
      blockedMessage: INJECTION_BLOCKED_MESSAGE,
      organizationId: getActiveOrgId(req),
    }).catch(() => undefined);

    // NDJSON-stream met één 'fallback' event zodat de client-side parser het
    // identiek behandelt aan een normale fallback (bestaande handler hoeft
    // niets nieuws te kennen).
    const blockedResponse: ChatResponse = {
      botVersion: bot.version,
      tone,
      length,
      kind: 'fallback',
      answer: INJECTION_BLOCKED_MESSAGE,
      reason: `Injection patroon gedetecteerd: ${patternName}`,
      topSimilarity: null,
      rewrite: null,
      sources: [],
      threshold,
      embedTokens: 0,
      totalCostUsd: 0,
    };
    const ndjson = JSON.stringify({ kind: 'fallback', response: blockedResponse }) + '\n';
    return new Response(ndjson, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const organizationId = getActiveOrgId(req);
  const generator = runRagQueryStreaming({
    question,
    threshold,
    enableRewrite,
    bot,
    history,
    tone,
    length,
    organizationId,
  });

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
      // Fire-and-forget logging na het sluiten van de stream. Bij log-only
      // injection-detectie geven we de detectie info mee zodat query_log
      // de telemetrie krijgt zonder dat we de query blokkeerden.
      if (finalResponse) {
        const injectionInfo = injection.detected
          ? { detected: true, pattern: injection.pattern?.name ?? null }
          : undefined;
        logQuery(question, finalResponse, injectionInfo, organizationId).catch(() => undefined);
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
