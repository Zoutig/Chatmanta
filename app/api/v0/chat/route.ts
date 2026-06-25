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
import { normalizeStyle } from '@/lib/rag/style';
import {
  detectInjection,
  getInjectionMode,
  resolveInjectionMode,
  INJECTION_BLOCKED_MESSAGE,
} from '@/lib/v0/server/injection';
import { getClientIp, getRateLimiter, getOrgRateLimiter } from '@/lib/v0/server/rate-limit';
import { getActiveOrgId, resolveOrgSlugFromId, KNOWN_ORGS } from '@/lib/v0/server/active-org';
import { checkOrgDailyBudget } from '@/lib/v0/server/budget';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { buildContactOfferEvent } from '@/lib/v0/server/contact-offer';
import { detectContactIntent } from '@/lib/v0/server/contact-intent';
import {
  buildChatbotOverrides,
  type ChatbotPromptOverrides,
} from '@/lib/v0/klantendashboard/server/build-chatbot-overrides';
import { commitTurn, findRecentThreadByVisitor } from '@/lib/v0/server/threads';
import {
  readVisitorId,
  readVisitorIdFromHeader,
  newVisitorId,
  serializeVisitorCookie,
} from '@/lib/v0/server/visitor';
import type { ManualQA } from '@/lib/v0/klantendashboard/types';
import { AppError, toAppError, toWire } from '@/lib/errors/app-error';
import { newRequestId } from '@/lib/errors/request-id';
import { captureError } from '@/lib/v0/server/error-capture';
import type { ErrorSeverity, ErrorSurface } from '@/lib/observability/sink';
// C9 (v0.10): de embed-auth-/herkomst-checks zijn naar lib/v0/server/embed-auth.ts
// getild zodat de chat-route en het AVG-delete-endpoint dezelfde veiligheidsgrens
// delen (geen drift). Gedrag byte-identiek.
import { isWidgetRequest, isCookieAuthed, isChatAuthorized } from '@/lib/v0/server/embed-auth';

export const runtime = 'nodejs';

// V0.3 doet tot ~6 LLM-calls + retrieval per vraag. Vercel default function
// timeout is 10s op Hobby — te kort voor v0.3 streaming. 60s is het Hobby
// max; ruim voor onze worst case (~10s).
export const maxDuration = 60;

// Defense-in-depth payload-grens. De finale semantische cap zit in rag.ts
// (1000 tekens, nette INPUT_INVALID); deze ruime grens weert alleen
// abuse-payloads (bv. megabytes tekst) vóór enig werk gedaan wordt.
const MAX_QUESTION_CHARS = 8000;

type Body = {
  question?: unknown;
  threshold?: unknown;
  enableRewrite?: unknown;
  enableGeneralKnowledge?: unknown;
  enableContactRequests?: unknown;
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
  // Pre-gegenereerde query_log-id zodat de widget hem al kent via het
  // 'meta'-event vóór de log-insert (die loopt post-stream via after()).
  // Wordt aan logQuery doorgegeven zodat de uiteindelijke row dezelfde id
  // krijgt — feedback kan zo betrouwbaar gekoppeld worden.
  const queryLogId = crypto.randomUUID();

  // Centrale fout-capture voor dit request → admin_error_groups (fire-and-forget,
  // never-throws). surface default 'chatbot'; severity wordt afgeleid van code
  // tenzij expliciet meegegeven; org valt terug op getActiveOrgId(req).
  const capture = (
    code: string,
    extra: {
      severity?: ErrorSeverity;
      surface?: ErrorSurface;
      error?: unknown;
      message?: string;
      organizationId?: string | null;
      inputRaw?: string;
      botVersion?: string;
    } = {},
  ) =>
    captureError({
      surface: extra.surface ?? 'chatbot',
      severity: extra.severity,
      code,
      message: extra.message,
      error: extra.error,
      organizationId: extra.organizationId ?? getActiveOrgId(req),
      inputRaw: extra.inputRaw,
      context: { requestId, route: '/api/v0/chat', botVersion: extra.botVersion },
    });

  // Widget-pad? Bepaalt of we visitor-grouping + server-side commitTurn doen.
  // Testtool-calls krijgen geen visitor-cookie en geen extra thread-write
  // (zou anders dubbele rijen geven naast de bestaande client-side commit).
  const isWidget = isWidgetRequest(req);
  // Visitor-id voor thread-grouping. Voorkeursvolgorde:
  //   1. expliciete x-chatmanta-visitor header (cookie-onafhankelijk; werkt in
  //      een third-party iframe waar de Lax-cookie geblokkeerd is)
  //   2. de v0_widget_visitor cookie (eigen omgeving / first-party)
  //   3. een verse id
  // De cookie sturen we altijd terug zodat first-party browsers hem alsnog
  // krijgen; in third-party context negeert de browser hem en draagt de header
  // de grouping.
  const visitorId = isWidget
    ? (readVisitorIdFromHeader(req) ?? readVisitorId(req) ?? newVisitorId())
    : null;
  const visitorCookieHeader = visitorId ? serializeVisitorCookie(visitorId) : null;

  // v0.4 security gate #1 — rate limit per IP. Faalt door als bucket overstroomt.
  const ip = getClientIp(req);
  const rl = await getRateLimiter().check(ip);
  if (!rl.allowed) {
    const err = new AppError('RATE_LIMIT', { retryAfterSec: rl.retryAfterSec });
    capture('RATE_LIMIT', { message: 'IP rate limit' });
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

  if (!isChatAuthorized(req)) {
    const err = new AppError('AUTH_REQUIRED');
    capture('AUTH_REQUIRED', { message: 'chat auth required' });
    return NextResponse.json(toWire(err, requestId), {
      status: err.status, // 401
      headers: { 'X-Request-Id': requestId },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    const err = new AppError('INPUT_INVALID', { message: 'invalid JSON body' });
    capture('INPUT_INVALID', { message: 'invalid JSON body' });
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: { 'X-Request-Id': requestId },
    });
  }

  const question = typeof body.question === 'string' ? body.question : '';
  const threshold = typeof body.threshold === 'number' ? body.threshold : 0.4;
  const enableRewrite = body.enableRewrite !== false;
  // Algemene-kennis: alleen een EXPLICIETE boolean uit de body (admin /admintool)
  // telt als override. Stuurt de caller niets (widget/embed, klant-test-scherm),
  // dan leiden we het ná de settings-load af uit de org-toggle (default uit).
  const explicitGeneralKnowledge =
    typeof body.enableGeneralKnowledge === 'boolean' ? body.enableGeneralKnowledge : undefined;
  // Contactverzoeken-toggle override — ALLEEN voor cookie-geauthenticeerde callers
  // (admin/test-panel). Een publieke embed-caller mag de override NIET sturen: dat
  // zou de gpt-4o-mini-intentiecall + het aanbod kunnen forceren terwijl de org-
  // toggle uit staat (onnodig kostenoppervlak + schending van de toggle-uit-
  // invariant). Publiek/embed → afgeleid uit de per-org toggle (default uit).
  const explicitContactRequests =
    isCookieAuthed(req) && typeof body.enableContactRequests === 'boolean'
      ? body.enableContactRequests
      : undefined;
  const version = typeof body.version === 'string' ? body.version : '';
  const history = parseHistory(body.history);
  const { tone, length } = normalizeStyle({ tone: body.tone, length: body.length });
  if (!question.trim()) {
    const err = new AppError('INPUT_INVALID', { message: 'question is required' });
    capture('INPUT_INVALID', { message: 'question is required' });
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: { 'X-Request-Id': requestId },
    });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    const err = new AppError('INPUT_INVALID', { message: 'question too long' });
    capture('INPUT_INVALID', { message: 'question too long' });
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
  // Publiek embed-pad (geen demo-cookie) blokkeert injection altijd; de admin-
  // testtool (cookie) volgt de env-modus (default log-only), zodat het tunen van
  // patterns niet gehinderd wordt door false-positives terwijl externe bezoekers
  // wél beschermd zijn.
  const injectionMode = resolveInjectionMode(isCookieAuthed(req), getInjectionMode());

  if (injection.detected && injectionMode === 'block') {
    const patternName = injection.pattern?.name ?? 'unknown';
    capture('INJECTION_BLOCKED', {
      message: `injection geblokkeerd: ${patternName}`,
      inputRaw: question,
      botVersion: bot.version,
    });
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
        capture('INTERNAL', {
          surface: 'system',
          severity: 'warning',
          error: err,
          message: 'logBlockedQuery faalde',
        });
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
    const blockedHeaders = new Headers({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
    });
    if (visitorCookieHeader) blockedHeaders.append('Set-Cookie', visitorCookieHeader);
    return new Response(ndjson, { status: 200, headers: blockedHeaders });
  }

  const organizationId = getActiveOrgId(req);

  // v0 security gate #3 — per-org rate-limit op het publieke pad. Vangt misbruik
  // af dat over meerdere IP's roteert (de per-IP gate bovenaan ziet dat niet).
  // Admin/test-pad (cookie) slaan we over. Draait ná de injection-block zodat
  // goedkope geblokkeerde requests de org-bucket niet vullen.
  if (!isCookieAuthed(req)) {
    const orgRl = await getOrgRateLimiter().check(`org:${organizationId}`);
    if (!orgRl.allowed) {
      const err = new AppError('RATE_LIMIT', { retryAfterSec: orgRl.retryAfterSec });
      capture('RATE_LIMIT', { message: 'org rate limit', organizationId });
      return NextResponse.json(toWire(err, requestId), {
        status: err.status,
        headers: {
          'Retry-After': String(orgRl.retryAfterSec),
          'X-RateLimit-Limit': String(orgRl.limit),
          'X-RateLimit-Remaining': '0',
          'X-Request-Id': requestId,
        },
      });
    }
  }

  // C3 (v0.10) — per-org dag-budget-cap (USD). Som de query_log-kosten van vandaag;
  // bij overschrijding van de cap weigeren we de LLM-call (HTTP 402 BUDGET_EXHAUSTED)
  // i.p.v. te genereren. Backstop tegen kosten-runaway op de publieke widget; geldt
  // org-breed (de ruime $2-default raakt legitiem gebruik praktisch nooit). Draait ná
  // de rate-limit zodat goedkope, al-gerate-limite requests geen extra DB-read doen.
  // De som kan onder-tellen als een eerdere logQuery-insert faalde (best-effort), dus
  // dit is een backstop — we loggen een cap-hit ook luid (capture).
  const budget = await checkOrgDailyBudget(organizationId);
  if (budget.over) {
    capture('BUDGET_EXHAUSTED', {
      severity: 'warning',
      message: `dag-budget bereikt: $${budget.spentUsd.toFixed(4)} >= cap $${budget.capUsd.toFixed(2)}`,
      organizationId,
    });
    const err = new AppError('BUDGET_EXHAUSTED');
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: { 'X-Request-Id': requestId },
    });
  }

  // Eén v0_org_settings-read voor zowel manual Q&A fast-path als de
  // chatbot-prompt-overrides (tone of voice, fallbackMessage, may-mention
  // toggles, extraInstructions, etc.). Bij DB-fout valt getOrgSettings al
  // stilzwijgend terug op mock-defaults — pipeline werkt zonder overrides
  // ook gewoon door.
  const orgSlug = resolveOrgSlugFromId(organizationId);
  let manualQAItems: ManualQA[] = [];
  let chatbotOverrides: ChatbotPromptOverrides | undefined;
  let contactRequestsEnabled = false;
  if (orgSlug) {
    try {
      const settings = await getOrgSettings(orgSlug);
      manualQAItems = settings.qa.filter((q) => q.active);
      chatbotOverrides = buildChatbotOverrides(settings.chatbot);
      contactRequestsEnabled = settings.contactRequests.enabled;
    } catch {
      // getOrgSettings throws zelden — alleen als zowel DB als de mock-fallback
      // falen. Pipeline draait gewoon door zonder overrides en zonder Q&A.
    }
  }

  // Body-tone/length winnen van de saved chatbot-overrides; rag.ts past die
  // hierarchie zelf toe (input.tone ?? chatbotOverrides?.tone ?? default).
  // Voor backwards-compat met de admin panel die expliciet tone/length stuurt
  // geven we de body-waardes alleen mee als de caller ze ook echt zond.
  const explicitTone = typeof body.tone === 'string' ? tone : undefined;
  const explicitLength = typeof body.length === 'string' ? length : undefined;

  // Resolve-volgorde: expliciete body-waarde (admin) → org-toggle → uit. Bij
  // onbekende org of een getOrgSettings-fout is `chatbotOverrides` undefined →
  // fail-closed naar uit (conform anti-hallucinatie hard rule).
  const enableGeneralKnowledge =
    explicitGeneralKnowledge ?? chatbotOverrides?.answerGeneralKnowledge ?? false;

  // Contactverzoeken: aanbod-gate. Body-override (admin/test) → per-org toggle →
  // uit. Bepaalt of de chat ná het antwoord een `contact-offer` event yieldt.
  // Raakt het antwoordpad NIET (event komt ná de drain, vóór close) — zo blijft
  // de eval-baseline byte-identiek.
  const enableContactOffer = explicitContactRequests ?? contactRequestsEnabled;
  const offerCompanyName = (orgSlug ? KNOWN_ORGS[orgSlug]?.name : null) ?? 'dit bedrijf';

  const generator = runRagQueryStreaming({
    question,
    threshold,
    enableRewrite,
    enableGeneralKnowledge,
    bot,
    history,
    tone: explicitTone,
    length: explicitLength,
    organizationId,
    hydeModeOverride: hydeModeRequested,
    manualQAItems,
    chatbotOverrides,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Eerste event = meta. De widget hangt deze id aan z'n actieve
      // assistant-message en gebruikt 'm bij /api/v0/feedback POST. Sturen
      // we vóór de eerste content zodat de feedback-knop direct na de
      // eerste delta enabled kan worden — race tussen "klik op 👎" en "id
      // beschikbaar" zou anders een lege body opleveren.
      controller.enqueue(
        encoder.encode(
          JSON.stringify({ kind: 'meta', queryLogId, requestId }) + '\n',
        ),
      );
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

        // M7 (contactverzoeken): ná een succesvolle drain en alleen bij een
        // echt answer-pad een contact-offer event yielden — achter de per-org
        // toggle én alleen als de bezoeker écht menselijk contact wil. De
        // detectie is een goedkope, fail-safe gpt-4o-mini-call (conversatie-
        // gericht, NIET #204's bedrijfs-extractie) die de prefill levert.
        // Bewust hier (route.ts) en ná answer-done, NOOIT in rag.ts: zo blijft
        // de eval-baseline byte-identiek. Faalt de generator, dan is
        // finalResponse geen 'answer' en/of vangt de buitenste catch — geen
        // aanbod. De smalltalk/fallback/injection-paden hebben een ander kind,
        // dus de gate borgt dat de detectie alléén op het answer-pad draait.
        if (enableContactOffer && finalResponse?.kind === 'answer') {
          // Eigen try/catch: een detectie-fout of -hang mag NOOIT
          // controller.close() blokkeren of de stream open laten staan. De
          // detectie heeft zelf al een harde timeout, maar deze guard is de
          // vangnet-laag. Kosten/tokens gaan bewust NIET naar query_log.
          let intent: Awaited<ReturnType<typeof detectContactIntent>> = {
            wantsContact: false,
            prefill: {},
          };
          try {
            intent = await detectContactIntent({
              question,
              answer: finalResponse.answer,
              history,
            });
          } catch (intentErr) {
            console.warn(
              '[chat stream] contact-intent guard ving fout:',
              requestId,
              intentErr instanceof Error ? intentErr.message : intentErr,
            );
            intent = { wantsContact: false, prefill: {} };
          }
          if (intent.wantsContact) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify(buildContactOfferEvent(offerCompanyName, intent.prefill)) + '\n',
              ),
            );
          }
        }
      } catch (err) {
        const appErr = toAppError(err);
        // Server-log de volledige technische context; client krijgt alleen code.
        console.error('[chat stream]', requestId, appErr.code, appErr.message, appErr.cause ?? '');
        capture(appErr.code, {
          error: appErr.cause ?? appErr,
          message: appErr.message,
          organizationId,
          inputRaw: question,
          botVersion: bot.version,
        });
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
              queryLogId,
            );
          } catch (err) {
            console.error(
              '[logQuery]',
              requestId,
              err instanceof Error ? err.message : err,
            );
            capture('INTERNAL', {
              surface: 'system',
              severity: 'warning',
              error: err,
              message: 'logQuery faalde',
              organizationId,
            });
          }
        });

        // Widget-thread persistentie (Scherm 6: Alle gesprekken). Lopen in een
        // eigen after() ná logQuery zodat een fout in de threads-laag de query_log
        // telemetrie niet sloopt. Skip in non-widget paden — testtool committet
        // zelf via app/actions/threads.ts → commitTurnAction (dubbele rij anders).
        if (isWidget && visitorId) {
          const widgetUserContent = question;
          const widgetResponse = finalResponseForLog;
          after(async () => {
            try {
              const existingThreadId = await findRecentThreadByVisitor(
                organizationId,
                visitorId,
                24,
              );
              await commitTurn({
                threadId: existingThreadId,
                userContent: widgetUserContent,
                response: widgetResponse,
                botVersion: bot.version,
                organizationId,
                visitorId,
              });
            } catch (err) {
              console.error(
                '[commitTurn widget]',
                requestId,
                err instanceof Error ? err.message : err,
              );
              capture('INTERNAL', {
                surface: 'system',
                severity: 'warning',
                error: err,
                message: 'commitTurn faalde',
                organizationId,
              });
            }
          });
        }
      }
    },
  });

  const streamHeaders = new Headers({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': requestId,
  });
  if (visitorCookieHeader) streamHeaders.append('Set-Cookie', visitorCookieHeader);
  return new Response(stream, { headers: streamHeaders });
}
