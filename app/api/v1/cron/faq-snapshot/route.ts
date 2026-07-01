// V1 FAQ-snapshot cron-entrypoint.
//
// Herberekent per chatbot de "Meest gestelde vragen"-snapshot (klant_faq_snapshot)
// als de laatste snapshot ouder is dan ~7 dagen. Vercel-cron kan dit dagelijks
// aanroepen (zie vercel.json); de staleness-check hier beslist of een chatbot
// daadwerkelijk herberekend wordt.
//
// Auth: Bearer CRON_SECRET — identiek aan app/api/v1/cron/process-crawls.
// Vercel voegt de Authorization-header automatisch toe bij cron-invocaties zodra
// CRON_SECRET als env-var is gezet. Zonder geldige secret → 401 (fail-closed).
//
// ?dryRun=1 → alleen rapporteren welke chatbots herberekend ZOUDEN worden
// (geen embed-calls, geen writes) — handig voor een handmatige check.

import { NextResponse, type NextRequest } from 'next/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { computeV1KlantFaqSnapshot } from '@/lib/v1/dashboard/faq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Embeddings over alle chatbots kunnen oplopen — ruime marge.
export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;
// Tolerantie: dagelijkse cron met 12u marge zodat wekelijkse verversing
// niet naar twee weken verschuift door timing-jitter.
const STALE_THRESHOLD_MS = 7 * DAY_MS - 12 * 60 * 60 * 1000;

type ChatbotResult = {
  orgId: string;
  chatbotId: string;
  status: 'recomputed' | 'skipped-fresh' | 'would-recompute' | 'error';
  lastGeneratedAt: string | null;
  embedCostUsd?: number;
  totalUnique?: number;
  error?: string;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  const sb = getV1ServiceRoleClient();

  try {
    // Haal alle actieve chatbots op (één per org in V1; deleted_at IS NULL).
    const { data: chatbots, error: cbErr } = await sb
      .from('chatbots')
      .select('id, organization_id')
      .is('deleted_at', null);
    if (cbErr) {
      return NextResponse.json({ ok: false, error: cbErr.message }, { status: 500 });
    }

    const now = Date.now();
    const results: ChatbotResult[] = [];

    for (const cb of chatbots ?? []) {
      const orgId = String(cb.organization_id);
      const chatbotId = String(cb.id);
      try {
        // Lees de meest recente snapshot om de staleness te bepalen.
        const { data: latest } = await sb
          .from('klant_faq_snapshot')
          .select('generated_at')
          .eq('organization_id', orgId)
          .eq('chatbot_id', chatbotId)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastGeneratedAt = (latest as { generated_at?: string } | null)?.generated_at ?? null;
        const ageMs = lastGeneratedAt
          ? now - new Date(lastGeneratedAt).getTime()
          : Infinity;
        const stale = ageMs > STALE_THRESHOLD_MS;

        if (!stale) {
          results.push({ orgId, chatbotId, status: 'skipped-fresh', lastGeneratedAt });
          continue;
        }

        if (dryRun) {
          results.push({ orgId, chatbotId, status: 'would-recompute', lastGeneratedAt });
          continue;
        }

        const snap = await computeV1KlantFaqSnapshot(sb, orgId, chatbotId);
        results.push({
          orgId,
          chatbotId,
          status: 'recomputed',
          lastGeneratedAt,
          embedCostUsd: snap.embedCostUsd,
          totalUnique: snap.totalUnique,
        });
      } catch (err) {
        // Één chatbot-fout mag de rest niet aborten.
        results.push({
          orgId,
          chatbotId,
          status: 'error',
          lastGeneratedAt: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const totalCostUsd = results.reduce((s, r) => s + (r.embedCostUsd ?? 0), 0);
    return NextResponse.json({
      ok: true,
      dryRun,
      staleThresholdDays: STALE_THRESHOLD_MS / DAY_MS,
      totalCostUsd,
      chatbots: results,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
