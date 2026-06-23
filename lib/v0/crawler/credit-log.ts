// V0 Website Crawler — Firecrawl credit-logging (Admin Dashboard, taak 7).
//
// Logt account-breed creditverbruik voor de operaties die NIET in crawl_events
// staan: map (sitemap-discovery), losse sitemap.xml-fetches en single-page scrapes.
// Batch-crawl-credits komen uit crawl_events.credits_used (daar afgeleid).
//
// FAIL-SAFE: een log-fout mag een crawl NOOIT breken — alles in een try/catch die
// stil slikt. Eigen lazy service-role client (de Firecrawl-wrappers krijgen geen
// sb mee). Geen org-context nodig: de overview-metric is account-breed.
//
// Géén `import 'server-only'`: firecrawl.ts (die deze helper importeert) deelt z'n
// constants met client-componenten (kennisbank website-tab), dus een server-only
// guard hier zou de client-build breken. De SERVICE_ROLE_KEY wordt pas runtime
// gelezen (niet NEXT_PUBLIC → uit de client-bundle gestript → db() = no-op client-side,
// geen key-lek), dus dit is veilig.

import { getServiceRoleClient } from '@/lib/supabase/admin';

/** Log Firecrawl-creditverbruik. Fail-safe — gooit nooit. */
export async function logFirecrawlCredits(
  operation: 'map' | 'sitemap' | 'scrape' | 'screenshot',
  credits: number,
  orgId?: string | null,
): Promise<void> {
  try {
    if (!Number.isFinite(credits) || credits <= 0) return;
    const sb = getServiceRoleClient();
    if (!sb) return;
    await sb.from('firecrawl_credit_log').insert({ operation, credits, organization_id: orgId ?? null });
  } catch {
    // bewust stil: usage-logging is nooit het kritieke pad.
  }
}
