// V1 publieke widget-chat — NDJSON stream van events. Port van app/api/v0/chat/route.ts,
// getrimd tot de V1-minimale widget (geen V0-demo-cookie, geen threads/feedback/
// contact-offer/injection-lib-v0 — die zijn V2; zie M-B_SPEC §G).
//
// Auth = puur token: embed-token (HMAC, fail-closed) + origin-lock. Org+chatbot worden
// UITSLUITEND uit de GESIGNEERDE slug geresolved via de service-role (nooit uit rauwe
// client-input) en runRagQuery draait met expliciete organizationId+chatbotId. Dat is
// de isolatie zonder per-user auth (SA-1: de slug-claim in het token is niet te
// vervalsen). Links staan UIT (hard rule 9), behalve per org Linkknoppen (migr V1 0031,
// alleen op verzoek) — zie applyLinkButtons in app/v1/app/widget-chat.ts.
//
// Format: ndjson — één JSON-object per regel. Eerst {kind:'meta', queryLogId, requestId},
// daarna de StreamEvents uit runRagQuery.

import { NextResponse, after } from 'next/server';
import type { ChatResponse, ChatHistoryTurn } from '@/lib/rag/run-rag-query';
import { logRagQuery } from '@/lib/rag/log-query';
import { appendTurn } from '@/lib/v1/conversations/write';
import { toThreadMessageSources } from '@/lib/v1/conversations/sources';
import { hashIp } from '@/lib/observability/hash-ip';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';
import { verifyEmbedToken } from '@/lib/v1/widget/embed-token';
import { sameOrigin } from '@/lib/v1/widget/origin-lock';
import {
  v1InjectionBlock,
  prepareV1WidgetChat,
  foldV1FinalResponse,
} from '@/app/v1/app/widget-chat';

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
  const injectionBlock = v1InjectionBlock(question);
  if (injectionBlock) return ndjsonOnce(requestId, queryLogId, injectionBlock);

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

  // 4a-7. Chatbot, klant-pauze, per-org gate (rate-limit + maand-cap + dag-budget),
  //       klant-settings, config (bronlinks uit, fast mode) en de runRagQuery-
  //       generator — gedeeld met de eval-suite (app/v1/app/widget-chat.ts).
  //       Terminale uitkomsten zijn niet billable (geen pipeline).
  const chat = await prepareV1WidgetChat(svc, { organizationId, question, history });
  if (chat.kind === 'no-chatbot') {
    return ndjsonOnce(requestId, queryLogId, { kind: 'error', code: 'INTERNAL', requestId });
  }
  if (chat.kind === 'terminal') return ndjsonOnce(requestId, queryLogId, chat.event);
  const { chatbot: activeChatbot, generator } = chat;

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
          finalResponse = foldV1FinalResponse(finalResponse, event);
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
          // WP4.3: gebruikte bronnen mee voor het detail-paneel. `sources` zit op
          // 'answer'/'fallback' (niet 'smalltalk') → 'sources' in responseForLog.
          const turnSources =
            'sources' in responseForLog ? toThreadMessageSources(responseForLog.sources) : null;
          after(() =>
            appendTurn(getV1ServiceRoleClient(), {
              orgId: organizationId,
              chatbotId: activeChatbot.id,
              threadId,
              question: question.trim(),
              answer: turnAnswer,
              kind: turnKind,
              sources: turnSources,
            }),
          );
        }
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS(requestId) });
}
