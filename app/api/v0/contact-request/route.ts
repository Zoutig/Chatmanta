// V0 contactverzoek submit-endpoint — POST een contactverzoek vanuit de widget.
//
// Dit is de EERSTE publieke V0-surface die ECHTE derde-partij-bezoeker-PII
// opslaat (naam/e-mail/telefoon). Zie migratie 0053 + de AGENTS.md V0-sandbox-
// disclaimer: V0 heeft geen per-org-auth → cross-org-leesbaarheid is een bewuste,
// bevestigde V1-blocker. De vangrails hier zijn: token-slug-org-binding,
// strenge origin-check, beide rate-limiters, consent-DB-CHECK, honeypot.
//
// ORG-RESOLUTIE (de kern — F1/F5): NOOIT getActiveOrgId (die valt terug op
// DEV_ORG → PII-leak naar de verkeerde tenant). In plaats daarvan:
//   1. ?org=<slug> uit de URL → resolveOrgIdFromSlug → reject (404) bij null
//      VÓÓR enige insert.
//   2. verifyEmbedToken(token, slug) moet slagen — het token draagt een
//      gesigneerde slug-claim, dus een getamperde ?org= faalt de signature → 401.
//   3. Strenge origin-check (client-error-stijl: new URL(origin).host === host).
//
// Flow: rate-limit (IP) → org-resolutie + token + origin → org-rate-limit →
// toggle-gate → body parsen → honeypot → validatie → thread-resolutie →
// idempotente insert → after() mail.

import { after, NextResponse } from 'next/server';

import { AppError, toAppError, toWire, type AppErrorCode } from '@/lib/errors/app-error';
import { newRequestId } from '@/lib/errors/request-id';
import { captureError } from '@/lib/v0/server/error-capture';
import {
  KNOWN_ORGS,
  resolveOrgIdFromSlug,
  type OrgSlug,
} from '@/lib/v0/server/active-org';
import { getClientIp, getOrgRateLimiter, getRateLimiter } from '@/lib/v0/server/rate-limit';
import { verifyEmbedToken } from '@/lib/v0/server/embed-token';
import { findRecentThreadByVisitor } from '@/lib/v0/server/threads';
import { getContactRequestsSettings } from '@/lib/v0/klantendashboard/server/settings';
import {
  insertContactRequest,
  type InsertContactRequestInput,
} from '@/lib/v0/klantendashboard/server/contact-requests-write';
import { isValidContactEmail } from '@/lib/notifications/contact-request-email';
import { notifyNewContactRequest } from '@/lib/notifications/contact-request-notify';

export const runtime = 'nodejs';

const NAME_MAX = 200;
const SUBJECT_MAX = 300;
const TOELICHTING_MAX = 4000;
const VISITOR_ID_MAX = 200;
// Telefoon: cijfers, spaties, +, haakjes, schuine streep, punt, koppelteken.
// 5-20 tekens — ruim genoeg voor NL/internationale notatie, streng genoeg om
// vrije tekst te weren.
const PHONE_RE = /^[\d+\s()\/.-]{5,20}$/;

type Body = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  preferredContact?: unknown;
  subject?: unknown;
  toelichting?: unknown;
  consentGiven?: unknown;
  visitorId?: unknown;
  // Honeypot — een echte bezoeker laat dit veld leeg; bots vullen het. Gevuld →
  // stil 200 zonder rij.
  company_url?: unknown;
  website?: unknown;
};

function err(code: AppErrorCode, requestId: string, message?: string): NextResponse {
  const e = new AppError(code, message ? { message } : {});
  return NextResponse.json(toWire(e, requestId), {
    status: e.status,
    headers: { 'X-Request-Id': requestId },
  });
}

// Strenge same-origin-check (client-error-stijl, NIET de lossere feedback-variant):
// de Origin/Referer-host moet exact gelijk zijn aan de app-host.
function isSameOrigin(req: Request): boolean {
  const host = req.headers.get('host');
  const originHdr = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !originHdr) return false;
  try {
    return new URL(originHdr).host === host;
  } catch {
    return false;
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export async function POST(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();

  // 1. Per-IP rate-limit FIRST (zelfde bucket-discipline als chat/feedback).
  const ip = getClientIp(req);
  const rl = await getRateLimiter().check(ip);
  if (!rl.allowed) {
    const e = new AppError('RATE_LIMIT', { retryAfterSec: rl.retryAfterSec });
    return NextResponse.json(toWire(e, requestId), {
      status: e.status,
      headers: { 'Retry-After': String(rl.retryAfterSec), 'X-Request-Id': requestId },
    });
  }

  // 2. Org-resolutie uit ?org=<slug> — NOOIT getActiveOrgId (DEV_ORG-leak).
  let slug = '';
  try {
    slug = new URL(req.url).searchParams.get('org') ?? '';
  } catch {
    slug = '';
  }
  const organizationId = resolveOrgIdFromSlug(slug);
  if (!organizationId) {
    // Geen/onbekende org → reject vóór enige insert (NIET terugvallen op DEV_ORG).
    return err('NOT_FOUND', requestId, 'onbekende of ontbrekende org');
  }
  const orgSlug = slug as OrgSlug; // gevalideerd tegen KNOWN_ORGS via resolveOrgIdFromSlug

  // 3. Embed-token moet de gesigneerde slug-claim dragen voor déze org. Een
  //    getamperde ?org= faalt de signature → 401.
  const token = req.headers.get('x-chatmanta-embed');
  if (!verifyEmbedToken(token, orgSlug)) {
    return err('AUTH_REQUIRED', requestId, 'ongeldig of ontbrekend embed-token');
  }

  // 4. Strenge origin-lock.
  if (!isSameOrigin(req)) {
    return err('AUTH_REQUIRED', requestId, 'origin niet toegestaan');
  }

  // 5. Per-org rate-limit (tweede begrenzing náást per-IP; vangt token-misbruik
  //    dat over IP's roteert).
  const orgRl = await getOrgRateLimiter().check(`org:${organizationId}`);
  if (!orgRl.allowed) {
    const e = new AppError('RATE_LIMIT', { retryAfterSec: orgRl.retryAfterSec });
    return NextResponse.json(toWire(e, requestId), {
      status: e.status,
      headers: { 'Retry-After': String(orgRl.retryAfterSec), 'X-Request-Id': requestId },
    });
  }

  // 6. Toggle-gate: functie staat uit voor deze org → 403 (geen submit mogelijk).
  let toggleEnabled = false;
  try {
    toggleEnabled = (await getContactRequestsSettings(orgSlug)).enabled;
  } catch {
    toggleEnabled = false; // fail-closed bij settings-read-fout
  }
  if (!toggleEnabled) {
    return err('AUTH_FORBIDDEN', requestId, 'contactverzoeken staan uit voor deze org');
  }

  // 7. Body parsen.
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err('INPUT_INVALID', requestId, 'invalid JSON body');
  }

  // 8. Honeypot — gevuld → bot. Stil 200 zonder rij (geen signaal naar de bot
  //    dat z'n inzending geweigerd is).
  const honeypot = (str(body.company_url) ?? '').trim() || (str(body.website) ?? '').trim();
  if (honeypot.length > 0) {
    return NextResponse.json({ ok: true }, { status: 200, headers: { 'X-Request-Id': requestId } });
  }

  // 9. Server-side validatie (hard).
  const visitorIdRaw = (str(body.visitorId) ?? '').trim();
  if (!visitorIdRaw) return err('INPUT_INVALID', requestId, 'visitorId is verplicht');
  const visitorId = visitorIdRaw.slice(0, VISITOR_ID_MAX);

  const name = (str(body.name) ?? '').trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    return err('INPUT_INVALID', requestId, `naam is verplicht (1-${NAME_MAX} tekens)`);
  }

  if (body.consentGiven !== true) {
    return err('INPUT_INVALID', requestId, 'toestemming is verplicht');
  }

  const preferred = str(body.preferredContact);
  if (preferred !== 'call' && preferred !== 'email') {
    return err('INPUT_INVALID', requestId, "preferredContact moet 'call' of 'email' zijn");
  }

  const emailRaw = (str(body.email) ?? '').trim();
  const phoneRaw = (str(body.phone) ?? '').trim();
  let email: string | null = emailRaw || null;
  let phone: string | null = phoneRaw || null;

  if (preferred === 'call') {
    if (!phone) return err('INPUT_INVALID', requestId, 'telefoonnummer is verplicht bij voorkeur bellen');
    if (!PHONE_RE.test(phone)) return err('INPUT_INVALID', requestId, 'ongeldig telefoonnummer');
  } else {
    if (!email) return err('INPUT_INVALID', requestId, 'e-mailadres is verplicht bij voorkeur mailen');
    if (!isValidContactEmail(email)) return err('INPUT_INVALID', requestId, 'ongeldig e-mailadres');
  }
  // Een meegegeven niet-voorkeursveld dat ongeldig is → wegfilteren i.p.v. de hele
  // submit te weigeren (de DB-CHECK eist alleen dat ÉÉN van beide gevuld is).
  if (phone && !PHONE_RE.test(phone)) phone = null;
  if (email && !isValidContactEmail(email)) email = null;

  const subjectRaw = str(body.subject);
  const toelichtingRaw = str(body.toelichting);
  const subject = subjectRaw ? subjectRaw.trim().slice(0, SUBJECT_MAX) || null : null;
  const toelichting = toelichtingRaw ? toelichtingRaw.trim().slice(0, TOELICHTING_MAX) || null : null;

  try {
    // 10. Thread-resolutie — best-effort, null-tolerant (F4). Bij de snelste
    //     eerste-turn-submits bestaat de thread-row nog niet (commitTurn loopt in
    //     after()) → thread_id blijft NULL. NOOIT falen daarop.
    let threadId: string | null = null;
    try {
      threadId = await findRecentThreadByVisitor(organizationId, visitorId, 24);
    } catch (e) {
      // Thread-lookup mag de submit nooit blokkeren — log en ga door met NULL.
      console.error('[contact-request]', requestId, 'thread-lookup faalde', (e as Error).message);
      threadId = null;
    }

    // 11. Idempotente insert. organization_id = server-geresolvete org (NOOIT
    //     client-org vertrouwen). 23505-conflict van de partial-UNIQUE → 200.
    const insertInput: InsertContactRequestInput = {
      organizationId,
      threadId,
      visitorId,
      name,
      email,
      phone,
      preferredContact: preferred,
      subject,
      toelichting,
    };
    const result = await insertContactRequest(insertInput);

    if (result.kind === 'idempotent') {
      // Actief verzoek bestaat al voor deze (org, visitor) → geen tweede rij,
      // geen tweede mail. (Een soft-deleted eerdere rij geeft GEEN idempotent —
      // de insert slaagt dan en valt in de 'created'-tak hieronder.)
      return NextResponse.json(
        { ok: true, idempotent: true },
        { status: 200, headers: { 'X-Request-Id': requestId } },
      );
    }

    // 12. DB = bron-van-waarheid; mail = best-effort via after() (nooit-throw).
    const created = result.request;
    after(async () => {
      await notifyNewContactRequest(created, KNOWN_ORGS[orgSlug].name, orgSlug);
    });

    return NextResponse.json(
      { ok: true, id: created.id },
      { status: 201, headers: { 'X-Request-Id': requestId } },
    );
  } catch (e) {
    const appErr = toAppError(e);
    // Geen PII in de logregel — alleen code/message (insertContactRequest gooit
    // generieke DB-messages zonder veldwaarden).
    console.error('[contact-request]', requestId, appErr.code, appErr.message);
    captureError({
      surface: 'api',
      code: appErr.code,
      message: appErr.message,
      error: appErr.cause ?? appErr,
      organizationId,
      context: { requestId, route: '/api/v0/contact-request' },
    });
    return NextResponse.json(toWire(appErr, requestId), {
      status: appErr.status,
      headers: { 'X-Request-Id': requestId },
    });
  }
}
