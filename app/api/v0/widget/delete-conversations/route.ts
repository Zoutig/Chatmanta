// C9 (v0.10) — AVG-verwijderpad: een widget-bezoeker wist zijn EIGEN gesprekken.
//
// Auth: dezelfde dual-auth als de chat (cookie OF geldig embed-token + same-origin),
// via de gedeelde embed-auth-helpers. De org komt uit de actieve-org-resolutie
// (embed-token is org-gebonden), dus de verwijdering is strikt ORG-gescoped.
//
// Identiteits-scope = het V0 visitor-id-model: de id komt uit de EIGEN cookie/header van
// de beller (x-chatmanta-visitor), NOOIT uit de request-body — exact hetzelfde signaal
// dat de chat al voor thread-grouping gebruikt. Het is een 122-bit random device-id dat
// alléén in de eigen browser-localStorage leeft (geen extern harvest-pad), GEEN
// geauthenticeerde identiteit: wie het device-id van een ander kent (≈ toegang tot diens
// browser) zou binnen dezelfde org diens gesprekken kunnen wissen. Voor de V0-sandbox
// (fake demo-data) is dit het bewuste model; echte per-bezoeker-auth is V1.

import { NextResponse } from 'next/server';
import { isChatAuthorized } from '@/lib/v0/server/embed-auth';
import { getActiveOrgId } from '@/lib/v0/server/active-org';
import { readVisitorId, readVisitorIdFromHeader } from '@/lib/v0/server/visitor';
import { deleteVisitorData } from '@/lib/v0/server/threads';
import { AppError, toWire } from '@/lib/errors/app-error';
import { newRequestId } from '@/lib/errors/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = newRequestId();

  if (!isChatAuthorized(req)) {
    const err = new AppError('AUTH_REQUIRED');
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: { 'X-Request-Id': requestId },
    });
  }

  const organizationId = getActiveOrgId(req);
  // Eigen identiteit: header (third-party iframe) of cookie. Geen body-param →
  // een beller kan nooit andermans visitor-data targeten.
  const visitorId = readVisitorIdFromHeader(req) ?? readVisitorId(req);
  if (!visitorId) {
    return NextResponse.json(
      { ok: true, deleted: { threadsDeleted: 0, messagesDeleted: 0 }, note: 'geen visitor-id' },
      { status: 200, headers: { 'X-Request-Id': requestId } },
    );
  }

  try {
    const deleted = await deleteVisitorData(organizationId, visitorId);
    return NextResponse.json(
      { ok: true, deleted },
      { status: 200, headers: { 'X-Request-Id': requestId } },
    );
  } catch (err) {
    const e = new AppError('INTERNAL', {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(toWire(e, requestId), {
      status: e.status,
      headers: { 'X-Request-Id': requestId },
    });
  }
}
