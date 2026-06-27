// V1 Website Crawler — Firecrawl credit-logging (account-brede kost-telemetrie).
//
// Spiegelt lib/v0/crawler/credit-log.ts maar schrijft naar het V1-project via de
// V1 service-role-factory. FAIL-SAFE: een log-fout mag een crawl NOOIT breken —
// alles in een try/catch die stil slikt.
//
// Géén `import 'server-only'`: firecrawl.ts (die deze helper importeert) deelt z'n
// constants met client-componenten (kennisbank website-tab), dus een server-only
// guard hier zou de client-build breken. getV1ServiceRoleClient leest de key pas
// runtime (V1_SUPABASE_SERVICE_ROLE_KEY, niet NEXT_PUBLIC → uit de client-bundle
// gestript) en gooit hooguit client-side — die throw wordt door de try/catch geslikt.

import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';

/** Log Firecrawl-creditverbruik (V1-project). Fail-safe — gooit nooit. */
export async function logFirecrawlCredits(
  operation: 'map' | 'sitemap' | 'scrape' | 'screenshot',
  credits: number,
  orgId?: string | null,
): Promise<void> {
  try {
    if (!Number.isFinite(credits) || credits <= 0) return;
    const sb = getV1ServiceRoleClient();
    await sb.from('firecrawl_credit_log').insert({ operation, credits, organization_id: orgId ?? null });
  } catch {
    // bewust stil: usage-logging is nooit het kritieke pad.
  }
}
