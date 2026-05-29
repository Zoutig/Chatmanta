// Admin Dashboard — Firecrawl credit-verbruik deze maand (taak 7 + taak 3).
//
// Bron-van-waarheid = de live Firecrawl account-usage-API (getFirecrawlAccountUsage):
// `usedThisPeriod` = creditsUsed van de huidige kalendermaand uit Firecrawl's eigen
// historiek-ledger, inclusief gefaalde crawls/map/sitemap. Het uitlezen kost geen
// credits. (NB: niet `plan − remaining` — dat klopt niet bij top-up/coupon-credits.)
//
// Fallback (API onbereikbaar / geen key / geen plan-info): een afgeleide SCHATTING
// uit onze eigen logs van deze maand — map/sitemap/scrape uit firecrawl_credit_log +
// batch-crawls uit crawl_events (per job de hoogste credits_used, want cumulatief).
// Die schatting undercount t.o.v. de echte rekening (alleen wat sinds migratie 0040 /
// in crawl_events gelogd is) — daarom labelt de UI 'source' expliciet. Read-only.

import 'server-only';

import { getSystemJobClient } from '@/lib/supabase/admin';
import { getFirecrawlAccountUsage } from '@/lib/v0/crawler/firecrawl';

export const FIRECRAWL_MONTHLY_LIMIT = Number(process.env.FIRECRAWL_MONTHLY_CREDIT_LIMIT) || 1000;

export type FirecrawlCreditUsage = {
  used: number;
  limit: number;
  /** Resterende credits volgens Firecrawl (null als alleen de schatting beschikbaar is). */
  remaining: number | null;
  pct: number;
  tone: 'ink' | 'warn' | 'danger';
  /** 'firecrawl' = live API (bron-van-waarheid); 'estimate' = afgeleid uit onze eigen logs. */
  source: 'firecrawl' | 'estimate';
};

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function toneFor(pct: number): FirecrawlCreditUsage['tone'] {
  return pct >= 90 ? 'danger' : pct >= 80 ? 'warn' : 'ink';
}

export async function getMonthlyFirecrawlCredits(): Promise<FirecrawlCreditUsage> {
  const envLimit = FIRECRAWL_MONTHLY_LIMIT;

  // 1. Bron-van-waarheid: live Firecrawl account-usage (verbruikt deze maand uit het
  //    historiek-ledger). Kost geen credits; valt safe terug op de schatting.
  const live = await getFirecrawlAccountUsage();
  if (live && live.usedThisPeriod != null && live.planCredits != null && live.planCredits > 0) {
    const used = live.usedThisPeriod;
    const limit = live.planCredits;
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    return { used, limit, remaining: live.remainingCredits, pct, tone: toneFor(pct), source: 'firecrawl' };
  }

  // 2. Fallback-schatting: afgeleid uit onze eigen logs van deze maand.
  try {
    const sb = await getSystemJobClient({ reason: 'firecrawl_credit_usage' });
    const since = startOfMonthIso();

    // map / sitemap / scrape uit het credit-log.
    const { data: logRows } = await sb
      .from('firecrawl_credit_log')
      .select('credits')
      .gte('created_at', since);
    const logSum = (logRows ?? []).reduce((a, r) => a + ((r.credits as number | null) ?? 0), 0);

    // batch-crawls: per job de hoogste credits_used uit crawl_events deze maand.
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
    const pct = envLimit > 0 ? Math.round((used / envLimit) * 100) : 0;
    return { used, limit: envLimit, remaining: live?.remainingCredits ?? null, pct, tone: toneFor(pct), source: 'estimate' };
  } catch {
    return { used: 0, limit: envLimit, remaining: live?.remainingCredits ?? null, pct: 0, tone: 'ink', source: 'estimate' };
  }
}
