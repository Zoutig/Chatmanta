// V0 streaming chat endpoint — NDJSON stream van events.
//
// Auth: relies on proxy.ts page-gate. Browser fetch from authenticated client
// passes the v0_auth cookie automatically; for V0 this is sufficient.
//
// Format: ndjson — één JSON object per regel, scheidings-token \n.
// Events: zie StreamEvent in lib/v0/server/rag.ts.

import { NextResponse, after } from 'next/server';
import {
  runRagQueryStreaming,
  resolveHydeMode,
  isHydeModeRequest,
  type ChatHistoryTurn,
  type ChatResponse,
  type HydeModeRequest,
} from '@/lib/v0/server/rag';
import { resolveBot } from '@/lib/v0/server/bots';
import { logQuery, logBlockedQuery, type HydeMeta } from '@/lib/v0/server/log';
import { normalizeStyle } from '@/lib/v0/style';
import { detectInjection, getInjectionMode, INJECTION_BLOCKED_MESSAGE } from '@/lib/v0/server/injection';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';
import { getActiveOrgId, resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import type { ManualQA } from '@/lib/v0/klantendashboard/types';
import { AppError, toAppError, toWire } from '@/lib/errors/app-error';
import { newRequestId } from '@/lib/errors/request-id';

export const runtime = 'nodejs';

// V0.3 doet tot ~6 LLM-calls + retrieval per vraag. Vercel default function
// timeout is 10s op Hobby — te kort voor v0.3 streaming. 60s is het Hobby
// max; ruim voor onze worst case (~10s).
export const maxDuration = 60;

type Body = {
  question?: unknown;
  threshold?: unknown;
  enableRewrite?: unknown;
  enableGeneralKnowledge?: unknown;
  version?: unknown;
  history?: unknown;
  tone?: unknown;
  length?: unknown;
  hydeMode?: unknown;
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
  // Defense-in-depth tegen kwaadwillende payloads. De werkelijke history-limiet
  // voor de answer-LLM zit in lib/v0/server/rag.ts (V0_CHAT_HISTORY_TURNS=8);
  // deze 16 = 2× die waarde, ruim genoeg om alle legitieme requests te accepteren.
  return out.slice(-16);
}

export async function POST(req: Request) {
  const requestId = newRequestId();

  // v0.4 security gate #1 — rate limit per IP. Faalt door als bucket overstroomt.
  const ip = getClientIp(req);
  const rl = await getRateLimiter().check(ip);
  if (!rl.allowed) {
    const err = new AppError('RATE_LIMIT', { retryAfterSec: rl.retryAfterSec });
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: {
        'Retry-After': String(rl.retryAfterSec),
        'X-RateLimit-Limit': String(rl.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)),
        'X-Request-Id': requestId,
      },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    const err = new AppError('INPUT_INVALID', { message: 'invalid JSON body' });
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: { 'X-Request-Id': requestId },
    });
  }

  const question = typeof body.question === 'string' ? body.question : '';
  const threshold = typeof body.threshold === 'number' ? body.threshold : 0.4;
  const enableRewrite = body.enableRewrite !== false;
  const enableGeneralKnowledge = body.enableGeneralKnowledge !== false;
  const version = typeof body.version === 'string' ? body.version : '';
  const history = parseHistory(body.history);
  const { tone, length } = normalizeStyle({ tone: body.tone, length: body.length });
  if (!question.trim()) {
    const err = new AppError('INPUT_INVALID', { message: 'question is required' });
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: { 'X-Request-Id': requestId },
    });
  }
  // HyDE-modus override (v0.5 evaluatie-toggle). Onbekende waarde of niet
  // gestuurd → 'auto' (= volg bot-versie config).
  const hydeModeRequested: HydeModeRequest = isHydeModeRequest(body.hydeMode)
    ? body.hydeMode
    : 'auto';

  const bot = resolveBot(version);
  // Resolve direct na bot-resolve: nodig voor logging van fallback/blocked
  // (die geen extras hebben). Pipeline gebruikt dezelfde resolve intern.
  const hydeModeActual = resolveHydeMode(bot, hydeModeRequested);

  // v0.4 security gate #2 — prompt-injection detector.
  // 'log-only' mode (default): we registreren de match en gaan door.
  // 'block' mode: we wijzen de query af met INJECTION_BLOCKED_MESSAGE.
  const injection = detectInjection(question);
  const injectionMode = getInjectionMode();

  if (injection.detected && injectionMode === 'block') {
    const patternName = injection.pattern?.name ?? 'unknown';
    // Post-response log via after() — voorkomt dat de blocked-telemetrie
    // verdampt op serverless wanneer de response al weg is.
    after(async () => {
      try {
        await logBlockedQuery({
          question,
          botVersion: bot.version,
          tone,
          length,
          injectionPattern: patternName,
          blockedMessage: INJECTION_BLOCKED_MESSAGE,
          organizationId: getActiveOrgId(req),
          requestId,
        });
      } catch (err) {
        console.error(
          '[logBlockedQuery]',
          requestId,
          err instanceof Error ? err.message : err,
        );
      }
    });

    // NDJSON-stream met één 'fallback' event zodat de client-side parser het
    // identiek behandelt aan een normale fallback (bestaande handler hoeft
    // niets nieuws te kennen).
    const blockedResponse: ChatResponse = {
      botVersion: bot.version,
      tone,
      length,
      generalKnowledgeActual: null,
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
        'X-Request-Id': requestId,
      },
    });
  }

  const organizationId = getActiveOrgId(req);
  // Manual Q&A fast-path: probeer de slug af te leiden uit de orgId zodat we
  // de v0_org_settings.qa-lijst kunnen laden. Lukt dit niet (onbekende
  // sandbox-org, query-tampering, etc.) dan slaan we Q&A over en draait de
  // pipeline gewoon als voorheen.
  const orgSlug = resolveOrgSlugFromId(organizationId);
  let manualQAItems: ManualQA[] = [];
  if (orgSlug) {
    try {
      const settings = await getOrgSettings(orgSlug);
      manualQAItems = settings.qa.filter((q) => q.active);
    } catch {
      // getOrgSettings doet zelf al fallback op mock-defaults bij DB-fout;
      // als hij hier toch gooit slaan we Q&A-fast-path stilzwijgend over.
    }
  }

  const generator = runRagQueryStreaming({
    question,
    threshold,
    enableRewrite,
    enableGeneralKnowledge,
    bot,
    history,
    tone,
    length,
    organizationId,
    hydeModeOverride: hydeModeRequested,
    manualQAItems,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let finalResponse: ChatResponse | null = null;
      try {
        for await (const event of generator) {
          // Capture / merge naar finalResponse voor logQuery aan het einde.
          // V0.4: followups-done en metrics-done vullen finalResponse aan ná
          // answer-done. Zonder die merge zou query_log de followups-tokens en
          // followups_ms missen.
          if (event.kind === 'smalltalk' || event.kind === 'fallback' || event.kind === 'answer-done') {
            finalResponse = event.response;
          } else if (event.kind === 'replacement') {
            // V0.5 claim-regenerate: het regenerate-antwoord vervangt het
            // eerder via answer-done gestreamede antwoord. logQuery moet
            // straks deze versie loggen.
            finalResponse = event.response;
          } else if (event.kind === 'followups-done' && finalResponse?.kind === 'answer') {
            const fr: Extract<ChatResponse, { kind: 'answer' }> = finalResponse;
            finalResponse = {
              ...fr,
              chatInputTokens: fr.chatInputTokens + event.inputTokens,
              chatOutputTokens: fr.chatOutputTokens + event.outputTokens,
              totalCostUsd: fr.totalCostUsd + event.costUsd,
              extras: {
                ...(fr.extras ?? {}),
                ...(event.followUps.length > 0 ? { followUps: event.followUps } : {}),
              },
            };
          } else if (event.kind === 'metrics-done' && finalResponse?.kind === 'answer') {
            const fr: Extract<ChatResponse, { kind: 'answer' }> = finalResponse;
            finalResponse = {
              ...fr,
              extras: {
                ...(fr.extras ?? {}),
                phaseTimingsMs: event.phaseTimingsMs,
              },
            };
          }
          // Verrijk error-events met requestId zodat de widget hem subtiel
          // kan tonen. Andere events gaan ongewijzigd door.
          const enriched =
            event.kind === 'error' ? { ...event, requestId } : event;
          controller.enqueue(encoder.encode(JSON.stringify(enriched) + '\n'));
        }
      } catch (err) {
        const appErr = toAppError(err);
        // Server-log de volledige technische context; client krijgt alleen code.
        console.error('[chat stream]', requestId, appErr.code, appErr.message, appErr.cause ?? '');
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              kind: 'error',
              ...toWire(appErr, requestId),
            }) + '\n',
          ),
        );
      } finally {
        controller.close();
      }
      // Post-stream logging — `after()` houdt de serverless-invocation in
      // leven tot logQuery klaar is, zodat query_log/cost/latency niet
      // verdampen op Vercel zodra de browser-response weg is. Fouten worden
      // expliciet gelogd ipv geslikt — terugvindbaar via requestId.
      if (finalResponse) {
        const injectionInfo = injection.detected
          ? { detected: true, pattern: injection.pattern?.name ?? null }
          : undefined;
        // Smalltalk shortcuit vóór HyDE — actual=null voor die kind. Voor
        // answer/fallback gebruiken we de resolved mode uit de pipeline-input.
        const hydeMeta: HydeMeta = {
          requested: hydeModeRequested,
          actual: finalResponse.kind === 'smalltalk' ? null : hydeModeActual,
        };
        const finalResponseForLog = finalResponse;
        after(async () => {
          try {
            await logQuery(
              question,
              finalResponseForLog,
              injectionInfo,
              organizationId,
              hydeMeta,
              requestId,
            );
          } catch (err) {
            console.error(
              '[logQuery]',
              requestId,
              err instanceof Error ? err.message : err,
            );
          }
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
    },
  });
}
