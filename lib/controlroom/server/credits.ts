// Admin Dashboard — Firecrawl credit-verbruik deze maand (taak 7).
//
// Account-breed totaal: (1) map/sitemap/scrape uit firecrawl_credit_log +
// (2) batch-crawls afgeleid uit crawl_events (per job de hoogste credits_used,
// want dat veld is cumulatief over de polls). Limiet default 1000, override via
// FIRECRAWL_MONTHLY_CREDIT_LIMIT. Read-only; service-role.
//
// Caveat: tracking van map/sitemap/scrape begint vanaf migratie 0040 — verbruik
// daarvóór telt alleen mee voor zover het in crawl_events stond.

import 'server-only';

import { getSystemJobClient } from '@/lib/supabase/admin';

export const FIRECRAWL_MONTHLY_LIMIT = Number(process.env.FIRECRAWL_MONTHLY_CREDIT_LIMIT) || 1000;

export type FirecrawlCreditUsage = {
  used: number;
  limit: number;
  pct: number;
  tone: 'ink' | 'warn' | 'danger';
};

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getMonthlyFirecrawlCredits(): Promise<FirecrawlCreditUsage> {
  const limit = FIRECRAWL_MONTHLY_LIMIT;
  try {
    const sb = await getSystemJobClient({ reason: 'firecrawl_credit_usage' });
    const since = startOfMonthIso();

    // 1. map / sitemap / scrape uit het credit-log.
    const { data: logRows } = await sb
      .from('firecrawl_credit_log')
      .select('credits')
      .gte('created_at', since);
    const logSum = (logRows ?? []).reduce((a, r) => a + ((r.credits as number | null) ?? 0), 0);

    // 2. batch-crawls: per job de hoogste credits_used uit crawl_events deze maand.
    const { data: evRows } = await sb
      .from('crawl_events')
      .select('processing_job_id, credits_used')
      .gte('created_at', since);
    const maxByJob = new Map<string, number>();
    for (const r of evRows ?? []) {
      const c = (r.credits_used as number | null) ?? null;
      if (c == null) continue;
      const jid = (r.processing_job_id as string | null) ?? `none-${maxByJob.size}`;
      if (c > (maxByJob.get(jid) ?? 0)) maxByJob.set(jid, c);
    }
    const batchSum = [...maxByJob.values()].reduce((a, c) => a + c, 0);

    const used = logSum + batchSum;
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const tone: FirecrawlCreditUsage['tone'] = pct >= 90 ? 'danger' : pct >= 80 ? 'warn' : 'ink';
    return { used, limit, pct, tone };
  } catch {
    return { used: 0, limit, pct: 0, tone: 'ink' };
  }
}
