// C8 (v0.10) — retentie-cron-entrypoint.
//
// Draait runRetentionCleanup() (lib/controlroom/server/retention.ts), die per org de
// chat-rijen (query_log + v0_thread_messages) ouder dan de retentie-termijn
// anonimiseert/verwijdert. Bedoeld voor de Vercel-cron (zie vercel.json, dagelijks).
//
// Auth: Bearer CRON_SECRET — identiek aan app/api/v0/cron/process-crawls. Vercel voegt
// deze Authorization-header automatisch toe aan cron-invocaties zodra CRON_SECRET als
// env-var gezet is. Zonder geldige secret → 401 (fail-closed).
//
// ?dryRun=1 → alleen rapporteren (geen mutatie), handig voor een handmatige check.

import { NextResponse, type NextRequest } from 'next/server';
import { runRetentionCleanup } from '@/lib/controlroom/server/retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  try {
    const results = await runRetentionCleanup({ apply: !dryRun });
    return NextResponse.json({ ok: true, applied: !dryRun, orgs: results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
