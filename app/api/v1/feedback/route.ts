// V1 widget-feedback endpoint — POST 👍/👎 (+ optionele toelichting) op een antwoord.
//
// Publieke widget-route: auth = puur embed-token (HMAC, fail-closed) + origin-lock,
// EXACT zoals /api/v1/chat. Org+chatbot komen UITSLUITEND uit de gesigneerde slug in
// het token (nooit uit de body of ?org=). Eigen rate-limit-bucket (per-route key in de
// mutation-limiter) zodat feedback de chat-budget niet leegtrekt en andersom.
//
// Writes via service-role (feedback is SELECT-only onder RLS). Object-level access
// (SA-1): we koppelen query_log_id alléén als die rij bij DEZELFDE org hoort; anders
// (onbekend door de async query_log-write, of een cross-org-poging) schrijven we de
// feedback met query_log_id = NULL. Zo vangen we de rating altijd op zonder een
// FK-violation en zonder een antwoord van een ándere org te kunnen koppelen.
//
// Fail-soft op de write: bij een onverwachte fout 200 {ok:false} i.p.v. 500 — een
// kapotte feedback-knop mag de widget niet laten ogen alsof de chat stuk is. Auth/
// rate-limit blijven WEL hard (fail-closed).

import { NextResponse } from 'next/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { getClientIp, getMutationRateLimiter, getOrgRateLimiter } from '@/lib/v0/server/rate-limit';
import { verifyEmbedToken } from '@/lib/v1/widget/embed-token';
import { sameOrigin } from '@/lib/v1/widget/origin-lock';
import { getOrgChatbot } from '@/app/v1/app/rag-config';

export const runtime = 'nodejs';

const COMMENT_MAX = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { queryLogId?: unknown; rating?: unknown; comment?: unknown };

export async function POST(req: Request) {
  // 0. Eigen rate-limit-bucket (per-route key in de mutation-limiter).
  const rl = await getMutationRateLimiter().check(`v1-feedback:${getClientIp(req)}`);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  // 1. embed-token + origin-lock (fail-closed), identiek aan /api/v1/chat.
  const slug = new URL(req.url).searchParams.get('org');
  const token = req.headers.get('x-chatmanta-embed');
  if (!slug || !sameOrigin(req) || !verifyEmbedToken(token, slug)) {
    return new NextResponse(null, { status: 401 });
  }

  // 2. Body + validatie.
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const rating = body.rating;
  if (rating !== 'up' && rating !== 'down') {
    return new NextResponse(null, { status: 400 });
  }
  const queryLogId =
    typeof body.queryLogId === 'string' && UUID_RE.test(body.queryLogId) ? body.queryLogId : null;
  let comment: string | null = null;
  if (typeof body.comment === 'string') {
    const t = body.comment.trim();
    comment = t.length === 0 ? null : t.slice(0, COMMENT_MAX);
  }

  try {
    const svc = getV1ServiceRoleClient();

    // 3. Org+chatbot uit de gesigneerde slug (token), NOOIT uit de body.
    const { data: org } = await svc
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();
    if (!org) return new NextResponse(null, { status: 401 });
    const organizationId = org.id as string;

    // 3b. Per-org rate-limit (spiegelt /api/v1/contact-request): vangt token-misbruik
    //     over roterende IP's af zodat één org niet ongelimiteerd feedback-rijen krijgt.
    const orgRl = await getOrgRateLimiter().check(`v1-feedback-org:${organizationId}`);
    if (!orgRl.allowed) {
      return new NextResponse(null, { status: 429, headers: { 'Retry-After': String(orgRl.retryAfterSec) } });
    }

    const chatbot = await getOrgChatbot(svc, organizationId);
    if (!chatbot) return NextResponse.json({ ok: false }, { status: 200 });

    // 4. Object-level access: koppel query_log_id alléén als die rij bij DEZE org
    //    hoort. Onbekend (async-log-race / nooit gelogd) of cross-org → NULL.
    let linkedQueryLogId: string | null = null;
    if (queryLogId) {
      const { data: logRow } = await svc
        .from('query_log')
        .select('id, organization_id')
        .eq('id', queryLogId)
        .maybeSingle();
      if (logRow && logRow.organization_id === organizationId) {
        linkedQueryLogId = queryLogId;
      }
    }

    const { error: insErr } = await svc.from('feedback').insert({
      organization_id: organizationId,
      chatbot_id: chatbot.id,
      query_log_id: linkedQueryLogId,
      rating,
      comment,
    });
    if (insErr) {
      console.error('[v1/feedback] insert faalde:', insErr.message);
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[v1/feedback] onverwachte fout:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
