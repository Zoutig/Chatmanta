// Publieke demo-chat voor /voorbeeld — NDJSON stream, zelfde eventformaat als
// /api/v1/chat zodat de voorbeeldwidget dezelfde parser gebruikt.
//
// Verschil met /api/v1/chat: de chatbot-INSTELLINGEN komen uit de request (de
// bezoeker past ze aan in het voorbeeld-dashboard; ze leven in zijn browser). De
// KENNIS komt altijd uit één vaste demo-org (DEMO_ORG_SLUG, fictief vakantiepark,
// gevuld met de tekst van de voorbeeldwebsite). Org en chatbot komen nooit uit de
// request: een bezoeker kan met deze route alleen de demo-kennis bevragen.
//
// Beveiliging (publiek, geen login):
//   0. per-IP rate-limit (zelfde limiter als de widget-chat), vóór alles
//   1. origin-lock: alleen aanroepbaar vanaf onze eigen host (de demo-pagina's)
//   2. injection-gate op de vraag
//   3. org-gates van de demo-org: per-org rate-limit + maandcap + dagbudget →
//      de kosten van de demo zijn begrensd door het budget van die ene org
//   4. instellingen: whitelist + lengte-caps (sanitizeChatbotPatch), daarna een
//      extra demo-cap op extraInstructions
// Geen transcript-write (appendTurn): bezoekersgesprekken in de demo blijven in
// de browser. Wel logRagQuery, zodat het dagbudget van de demo-org meetelt.

import { NextResponse, after } from 'next/server';
import { runRagQuery, type ChatResponse, type ChatHistoryTurn } from '@/lib/rag/run-rag-query';
import { logRagQuery } from '@/lib/rag/log-query';
import { hashIp } from '@/lib/observability/hash-ip';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';
import { detectInjection, INJECTION_BLOCKED_MESSAGE } from '@/lib/v0/server/injection';
import { sameOrigin } from '@/lib/v1/widget/origin-lock';
import { checkOrgChatGates } from '@/lib/v1/limits/chat-gates';
import { V1_RAG_DEFAULTS, getOrgChatbot } from '@/app/v1/app/rag-config';
import {
  buildV1ChatbotInputs,
  mergeChatbotSettings,
  sanitizeChatbotPatch,
  type V1ChatbotSettings,
} from '@/app/v1/app/instellingen/settings-config';
import { DEMO_DEFAULT_SETTINGS, DEMO_ORG_NAME } from '@/lib/voorbeeld/demo-defaults';
import { DEMO_ORG_SLUG } from '@/lib/voorbeeld/constants';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_QUESTION_CHARS = 2000;
// Demo-cap: vrije extra instructies houden we kort (geen prompt-bloat op onze kosten).
const MAX_DEMO_EXTRA_INSTRUCTIONS = 600;

type Body = { question?: unknown; history?: unknown; settings?: unknown };

function parseHistory(input: unknown): ChatHistoryTurn[] {
  if (!Array.isArray(input)) return [];
  const out: ChatHistoryTurn[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      out.push({ role, content: content.slice(0, 1500) });
    }
  }
  // Krapper dan /api/v1/chat (16×4000): een demo-gesprek is kort.
  return out.slice(-8);
}

/** Bezoekers-instellingen → volledige settings, veilig gemerged over de demo-defaults. */
function resolveSettings(raw: unknown): V1ChatbotSettings {
  let patch: Partial<V1ChatbotSettings> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    try {
      patch = sanitizeChatbotPatch(raw as Partial<V1ChatbotSettings>);
    } catch {
      // Te lang veld o.i.d.: val terug op de demo-defaults.
      patch = {};
    }
  }
  const merged = mergeChatbotSettings({ ...DEMO_DEFAULT_SETTINGS, ...patch });
  // Wat de bezoeker niet mag sturen: de kennis- en contactgrens van de demo-org.
  merged.answerGeneralKnowledge = false;
  merged.extraInstructions = merged.extraInstructions.slice(0, MAX_DEMO_EXTRA_INSTRUCTIONS);
  merged.companyDescription = merged.companyDescription.slice(0, MAX_DEMO_EXTRA_INSTRUCTIONS);
  return merged;
}

const NDJSON_HEADERS = (requestId: string) =>
  new Headers({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': requestId,
  });

function ndjsonOnce(requestId: string, queryLogId: string, event: object): Response {
  const body =
    JSON.stringify({ kind: 'meta', queryLogId, requestId }) + '\n' + JSON.stringify(event) + '\n';
  return new Response(body, { status: 200, headers: NDJSON_HEADERS(requestId) });
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const queryLogId = crypto.randomUUID();

  const rl = await getRateLimiter().check(getClientIp(req));
  if (!rl.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSec), 'X-Request-Id': requestId },
    });
  }

  if (!sameOrigin(req)) {
    return new NextResponse(null, { status: 401, headers: { 'X-Request-Id': requestId } });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new NextResponse(null, { status: 400, headers: { 'X-Request-Id': requestId } });
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return new NextResponse(null, { status: 400, headers: { 'X-Request-Id': requestId } });
  }
  const history = parseHistory(body.history);

  if (detectInjection(question).detected) {
    return ndjsonOnce(requestId, queryLogId, {
      kind: 'fallback',
      response: { kind: 'fallback', answer: INJECTION_BLOCKED_MESSAGE },
    });
  }

  const svc = getV1ServiceRoleClient();
  const { data: org } = await svc
    .from('organizations')
    .select('id')
    .eq('slug', DEMO_ORG_SLUG)
    .is('deleted_at', null)
    .maybeSingle();
  if (!org) {
    return ndjsonOnce(requestId, queryLogId, { kind: 'error', code: 'INTERNAL', requestId });
  }
  const organizationId = org.id as string;

  let chatbot: Awaited<ReturnType<typeof getOrgChatbot>> = null;
  try {
    chatbot = await getOrgChatbot(svc, organizationId);
  } catch {
    chatbot = null;
  }
  if (!chatbot) {
    return ndjsonOnce(requestId, queryLogId, { kind: 'error', code: 'INTERNAL', requestId });
  }
  const chatbotId = chatbot.id;
  // Noodknop: chatbot van de demo-org op pauze (chatbots.is_active) → geen pipeline.
  if (chatbot.is_active === false) {
    return ndjsonOnce(requestId, queryLogId, {
      kind: 'fallback',
      response: { kind: 'fallback', answer: 'De voorbeeldchatbot is even niet beschikbaar. Probeer het later opnieuw.' },
    });
  }

  const gate = await checkOrgChatGates(svc, organizationId);
  if (!gate.ok) {
    return ndjsonOnce(requestId, queryLogId, {
      kind: 'fallback',
      response: { kind: 'fallback', answer: gate.message },
    });
  }

  const settings = resolveSettings(body.settings);
  const { overrides, persona } = buildV1ChatbotInputs(settings, DEMO_ORG_NAME);

  const config = { ...V1_RAG_DEFAULTS, version: chatbot.bot_version, sourceLinksEnabled: false };

  // disableCache: de cache-key kent de instellingen niet; met wisselende tone/lengte
  // per bezoeker zou een cache-hit het antwoord van een ándere instelling geven.
  const generator = runRagQuery(svc, {
    question,
    threshold: config.similarityThreshold,
    enableRewrite: config.enableRewriteByDefault,
    config,
    persona,
    organizationId,
    chatbotId,
    history,
    tone: overrides.tone,
    length: overrides.length,
    chatbotOverrides: overrides,
    serviceClient: svc,
    disableCache: true,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ kind: 'meta', queryLogId, requestId }) + '\n'));
      let finalResponse: ChatResponse | null = null;
      try {
        for await (const event of generator) {
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
            };
          }
          const enriched = event.kind === 'error' ? { ...event, requestId } : event;
          controller.enqueue(encoder.encode(JSON.stringify(enriched) + '\n'));
        }
      } catch (err) {
        console.error('[voorbeeld/chat stream]', requestId, err instanceof Error ? err.message : err);
        controller.enqueue(encoder.encode(JSON.stringify({ kind: 'error', code: 'INTERNAL', requestId }) + '\n'));
      } finally {
        controller.close();
      }

      if (finalResponse) {
        const responseForLog = finalResponse;
        const ipHash = hashIp(getClientIp(req));
        after(() =>
          logRagQuery(getV1ServiceRoleClient(), {
            question,
            response: responseForLog,
            organizationId,
            chatbotId,
            ipHash,
            requestId,
            overrideId: queryLogId,
          }),
        );
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS(requestId) });
}
