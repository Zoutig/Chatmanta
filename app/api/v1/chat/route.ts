// V1 publieke widget-chat — NDJSON stream van events. Port van app/api/v0/chat/route.ts,
// getrimd tot de V1-minimale widget (geen V0-demo-cookie, geen threads/feedback/
// contact-offer/injection-lib-v0 — die zijn V2; zie M-B_SPEC §G).
//
// Auth = puur token: embed-token (HMAC, fail-closed) + origin-lock. Org+chatbot worden
// UITSLUITEND uit de GESIGNEERDE slug geresolved via de service-role (nooit uit rauwe
// client-input) en runRagQuery draait met expliciete organizationId+chatbotId. Dat is
// de isolatie zonder per-user auth (SA-1: de slug-claim in het token is niet te
// vervalsen). sourceLinksEnabled staat UIT op dit pad (document-only RPC, §1.5-V2).
//
// Format: ndjson — één JSON-object per regel. Eerst {kind:'meta', queryLogId, requestId},
// daarna de StreamEvents uit runRagQuery.

import { NextResponse, after } from 'next/server';
import {
  runRagQuery,
  type ChatResponse,
  type ChatHistoryTurn,
} from '@/lib/rag/run-rag-query';
import { logRagQuery } from '@/lib/rag/log-query';
import { appendTurn } from '@/lib/v1/conversations/write';
import { hashIp } from '@/lib/observability/hash-ip';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';
// TODO(V2): graduate detectInjection to a neutral lib/rag detector to drop the lib/v0 import.
import { detectInjection, INJECTION_BLOCKED_MESSAGE } from '@/lib/v0/server/injection';
import { verifyEmbedToken } from '@/lib/v1/widget/embed-token';
import { sameOrigin } from '@/lib/v1/widget/origin-lock';
import { checkOrgChatGates } from '@/lib/v1/limits/chat-gates';
import { V1_RAG_DEFAULTS, getOrgChatbot, buildV1Persona } from '@/app/v1/app/rag-config';
import { getChatbotSettings, buildV1ChatbotInputs } from '@/app/v1/app/instellingen/settings-config';
import type { ChatbotPromptOverrides } from '@/lib/v0/klantendashboard/server/build-chatbot-overrides';
import type { RagPersona } from '@/lib/rag/types';

export const runtime = 'nodejs';
// Ruim onder de Hobby-cap; één V1-vraag doet tot enkele LLM-calls + retrieval.
export const maxDuration = 60;

// Defense-in-depth payload-grens; de semantische cap zit in de engine.
const MAX_QUESTION_CHARS = 8000;

type Body = { question?: unknown; version?: unknown; history?: unknown; threadId?: unknown };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseHistory(input: unknown): ChatHistoryTurn[] {
  if (!Array.isArray(input)) return [];
  const out: ChatHistoryTurn[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      out.push({ role, content: content.slice(0, 4000) });
    }
  }
  // 16 = 2× de engine-history-limiet — ruim genoeg voor elk legitiem request.
  return out.slice(-16);
}

const NDJSON_HEADERS = (requestId: string) =>
  new Headers({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': requestId,
  });

/** Eén NDJSON-event als complete response (voor de error-/no-chatbot-paden). */
function ndjsonOnce(requestId: string, queryLogId: string, event: object): Response {
  const body =
    JSON.stringify({ kind: 'meta', queryLogId, requestId }) + '\n' + JSON.stringify(event) + '\n';
  return new Response(body, { status: 200, headers: NDJSON_HEADERS(requestId) });
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  // Pre-gegenereerde query_log-id zodat de widget hem al kent via het 'meta'-event
  // vóór de log-insert (die loopt post-stream via after()).
  const queryLogId = crypto.randomUUID();

  // 0. Per-IP rate-limit — V0's gate #1, vóór auth (cost-explosion guard).
  //    Hergebruikt de Upstash-backed limiter (USE_UPSTASH) met in-memory fail-safe;
  //    dezelfde RATE_LIMIT_PER_MIN-config als V0. Block → 429 + RateLimit-headers.
  const rl = await getRateLimiter().check(getClientIp(req));
  if (!rl.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: {
        'Retry-After': String(rl.retryAfterSec),
        'X-RateLimit-Limit': String(rl.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)),
        'X-Request-Id': requestId,
      },
    });
  }

  const slug = new URL(req.url).searchParams.get('org');

  // 1. embed-token + origin-lock. Geen demo-cookie-pad in V1 — puur token.
  const token = req.headers.get('x-chatmanta-embed');
  if (!slug || !sameOrigin(req) || !verifyEmbedToken(token, slug)) {
    return new NextResponse(null, { status: 401, headers: { 'X-Request-Id': requestId } });
  }

  // 2. Body-parse + validatie.
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new NextResponse(null, { status: 400, headers: { 'X-Request-Id': requestId } });
  }
  const question = typeof body.question === 'string' ? body.question : '';
  const history = parseHistory(body.history);
  if (!question.trim() || question.length > MAX_QUESTION_CHARS) {
    return new NextResponse(null, { status: 400, headers: { 'X-Request-Id': requestId } });
  }
  // Client-gegenereerde sessie-thread-id (uuid). Alléén voor het transcript — niet
  // voor autorisatie (org+chatbot komen uit het token). Ongeldig/ontbrekend → geen
  // thread-write (de chat draait gewoon door).
  const threadId =
    typeof body.threadId === 'string' && UUID_RE.test(body.threadId) ? body.threadId : null;

  // 2b. Prompt-injection gate — V0 public-path parity: het publieke widget-pad
  //     blokkeert injection ALTIJD, vóór enige pipeline/DB-call. Eén terminale
  //     'fallback' event met INJECTION_BLOCKED_MESSAGE — de widget toont dat als
  //     antwoord (ev.response.answer). Block wordt NIET gelogd (V1 logRagQuery kent
  //     geen blocked-kind; bewust minimaal — geen nieuwe infra).
  if (detectInjection(question).detected) {
    return ndjsonOnce(requestId, queryLogId, {
      kind: 'fallback',
      response: { kind: 'fallback', answer: INJECTION_BLOCKED_MESSAGE },
    });
  }

  // 4. Resolve org+chatbot uit de GESIGNEERDE slug via service-role.
  const svc = getV1ServiceRoleClient();
  const { data: org, error: orgErr } = await svc
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (orgErr || !org) {
    return new NextResponse(null, { status: 401, headers: { 'X-Request-Id': requestId } });
  }
  const organizationId = org.id as string;

  let chatbot: { id: string; name: string; bot_version: string } | null = null;
  try {
    chatbot = await getOrgChatbot(svc, organizationId);
  } catch {
    chatbot = null;
  }
  if (!chatbot) {
    return ndjsonOnce(requestId, queryLogId, { kind: 'error', code: 'INTERNAL', requestId });
  }
  const activeChatbot = chatbot;

  // 4b. M-C combined per-ORG gate: per-org rate-limit + maand-cap + dag-budget. De per-IP
  //     rate-limit (gate #0) blijft staan; dit voegt per-org + kosten/maand toe. Block →
  //     terminale 'fallback'-NDJSON met de gate-message (zoals de injection-block);
  //     geen pipeline → niet billable.
  const gate = await checkOrgChatGates(svc, organizationId);
  if (!gate.ok) {
    return ndjsonOnce(requestId, queryLogId, {
      kind: 'fallback',
      response: { kind: 'fallback', answer: gate.message },
    });
  }

  // 5. Klant-settings → engine-overrides. Bij een settings-read-fout draaien we door
  //    op de default-persona zonder overrides (de chat mag niet falen op een
  //    settings-hapering).
  let overrides: ChatbotPromptOverrides | undefined;
  let persona: RagPersona;
  try {
    const settings = await getChatbotSettings(svc, activeChatbot.id);
    ({ overrides, persona } = buildV1ChatbotInputs(settings, activeChatbot.name));
  } catch {
    overrides = undefined;
    persona = buildV1Persona(activeChatbot.name);
  }

  // 6. Config — widget-override: sourceLinksEnabled UIT (document-only RPC).
  const config = {
    ...V1_RAG_DEFAULTS,
    version: activeChatbot.bot_version,
    sourceLinksEnabled: false,
  };

  // 7. Stream. GK blijft fail-closed (geen enableGeneralKnowledge meegegeven →
  //    config.generalKnowledgeEnabled=false wint). Cache leest+schrijft via svc.
  const generator = runRagQuery(svc, {
    question: question.trim(),
    threshold: config.similarityThreshold,
    enableRewrite: config.enableRewriteByDefault,
    config,
    persona,
    organizationId,
    chatbotId: activeChatbot.id,
    history,
    tone: overrides?.tone,
    length: overrides?.length,
    chatbotOverrides: overrides,
    serviceClient: svc,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(JSON.stringify({ kind: 'meta', queryLogId, requestId }) + '\n'),
      );
      let finalResponse: ChatResponse | null = null;
      try {
        for await (const event of generator) {
          // Merge naar finalResponse voor query_log (cost/latency); spiegelt askV1 +
          // app/api/v0/chat. followups-done/metrics-done vullen ná answer-done aan.
          if (
            event.kind === 'smalltalk' ||
            event.kind === 'fallback' ||
            event.kind === 'answer-done' ||
            event.kind === 'replacement'
          ) {
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
            finalResponse = { ...fr, extras: { ...(fr.extras ?? {}), phaseTimingsMs: event.phaseTimingsMs } };
          }
          const enriched = event.kind === 'error' ? { ...event, requestId } : event;
          controller.enqueue(encoder.encode(JSON.stringify(enriched) + '\n'));
        }
      } catch (err) {
        console.error('[v1/chat stream]', requestId, err instanceof Error ? err.message : err);
        controller.enqueue(encoder.encode(JSON.stringify({ kind: 'error', code: 'INTERNAL', requestId }) + '\n'));
      } finally {
        controller.close();
      }

      // 8. Post-stream logging — after() houdt de invocation in leven tot de insert
      //    klaar is. Best-effort (logRagQuery throwt nooit). ipHash: gehasht
      //    bezoeker-IP (AVG). overrideId = de id die de widget al kent via 'meta'.
      if (finalResponse) {
        const responseForLog = finalResponse;
        const ipHash = hashIp(getClientIp(req));
        after(() =>
          logRagQuery(getV1ServiceRoleClient(), {
            question: question.trim(),
            response: responseForLog,
            organizationId,
            chatbotId: activeChatbot.id,
            ipHash,
            requestId,
            overrideId: queryLogId,
          }),
        );

        // 8b. Transcript-write — ADDITIEF na de pipeline, best-effort. Org+chatbot
        //     komen uit het token (NOOIT de body); threadId is de client-sessie-uuid.
        //     appendTurn throwt nooit; een write-fout breekt de stream niet.
        //     finalResponse.kind ∈ {smalltalk,answer,fallback} — alle geldig in de
        //     thread_messages.kind-CHECK.
        if (threadId) {
          const turnAnswer = responseForLog.answer;
          const turnKind = responseForLog.kind;
          after(() =>
            appendTurn(getV1ServiceRoleClient(), {
              orgId: organizationId,
              chatbotId: activeChatbot.id,
              threadId,
              question: question.trim(),
              answer: turnAnswer,
              kind: turnKind,
            }),
          );
        }
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS(requestId) });
}
