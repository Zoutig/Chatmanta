// M4 — klantendashboard FAQ-snapshot cron-entrypoint.
//
// Herberekent per org de "Meest gestelde vragen"-snapshot (klant_faq_snapshot)
// op een cadans (weekly|monthly), instelbaar via admin_config door de operator.
// Vercel-cron draait dit DAGELIJKS (zie vercel.json, 04:00); de cadans-gate
// hieronder beslist of een org daadwerkelijk wordt herberekend (snapshot ouder
// dan ~7d bij weekly / ~30d bij monthly). Dagelijks i.p.v. wekelijks draaien
// (Codex M4 #3) maakt de cadans-grens precies — een wekelijkse cron zou monthly
// feitelijk ~35d maken — en is goedkoop: verse orgs worden meteen overgeslagen.
//
// Auth: Bearer CRON_SECRET — identiek aan app/api/v0/cron/retention. Vercel voegt
// deze Authorization-header automatisch toe aan cron-invocaties zodra CRON_SECRET
// als env-var gezet is. Zonder geldige secret → 401 (fail-closed).
//
// ?dryRun=1 → alleen rapporteren welke orgs herberekend ZOUDEN worden (geen
// embed-calls, geen writes) — handig voor een handmatige check.

import { NextResponse, type NextRequest } from 'next/server';
import { KNOWN_ORGS, ALL_ORG_SLUGS } from '@/lib/v0/server/active-org';
import {
  computeKlantFaqSnapshot,
  getKlantFaqSnapshot,
} from '@/lib/v0/klantendashboard/server/faq-klant';
import { getFaqRefreshCadence } from '@/lib/v0/server/admin-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Embeddings over alle orgs kunnen oplopen — ruime marge boven de cron-default.
export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

type OrgResult = {
  slug: string;
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

  try {
    const cadence = await getFaqRefreshCadence();
    // Tolerantie (Codex M4 #2): de cron draait wekelijks; een snapshot die net
    // ná de vorige run is geschreven is bij de volgende run "bijna 7 dagen" oud.
    // Zonder marge wordt 'm dan overgeslagen → weekly verschuift naar twee-
    // wekelijks. Een halve dag aftrekken laat de wekelijkse run altijd herrekenen.
    const TOLERANCE_MS = 12 * 60 * 60 * 1000;
    const thresholdMs =
      (cadence === 'monthly' ? 30 * DAY_MS : 7 * DAY_MS) - TOLERANCE_MS;
    const now = Date.now();

    const results: OrgResult[] = [];
    for (const slug of ALL_ORG_SLUGS) {
      const orgId = KNOWN_ORGS[slug].id;
      try {
        const latest = await getKlantFaqSnapshot(orgId);
        const lastGeneratedAt = latest?.generatedAt ?? null;
        const ageMs = lastGeneratedAt
          ? now - new Date(lastGeneratedAt).getTime()
          : Infinity;
        const stale = !latest || ageMs > thresholdMs;

        if (!stale) {
          results.push({ slug, status: 'skipped-fresh', lastGeneratedAt });
          continue;
        }

        if (dryRun) {
          results.push({ slug, status: 'would-recompute', lastGeneratedAt });
          continue;
        }

        const snap = await computeKlantFaqSnapshot(orgId);
        results.push({
          slug,
          status: 'recomputed',
          lastGeneratedAt,
          embedCostUsd: snap.embedCostUsd,
          totalUnique: snap.totalUnique,
        });
      } catch (err) {
        // Eén org-fout mag de rest niet aborten.
        results.push({
          slug,
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
      cadence,
      thresholdDays: thresholdMs / DAY_MS,
      totalCostUsd,
      orgs: results,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
