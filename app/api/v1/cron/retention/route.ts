// V1 AVG-retentie-cron — harde delete van bezoekers-PII in contact_requests ouder
// dan 90 dagen (V1_CONTACT_RETENTION_DAYS). V1-tegenhanger van
// app/api/v0/cron/retention: V0 heeft dit al, V1-prod nog niet, dus de 90-dagen-
// belofte draaide daar niet. Deze route dicht dat gat.
//
// Aangeroepen door een EXTERNE cron-job.org-pinger (dagelijks) — NIET via vercel.json
// (de Hobby-cron-slots zijn voor V0; V1-cron-routes draaien op de externe pinger,
// zoals process-crawls en faq-snapshot).
//
// Auth: Bearer CRON_SECRET (fail-closed) — identiek aan de andere V1-cron-routes.
// ?dryRun=1 → alleen tellen (geen delete). De response bevat alléén aantallen,
// nooit PII.

import { NextResponse, type NextRequest } from 'next/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { runV1ContactRetention } from '@/lib/v1/observability/retention';
import { isAuthorizedCron } from '@/lib/security/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Default = daadwerkelijk verwijderen (de pinger stuurt geen dryRun); ?dryRun=1 telt
  // alleen — spiegelt app/api/v0/cron/retention.
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  try {
    const result = await runV1ContactRetention(getV1ServiceRoleClient(), { apply: !dryRun });
    return NextResponse.json({ ok: true, dryRun, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
