'use server';

// V1 Website Crawler — server actions voor het Kennisbank-dashboard (app/v1).
//
// Auth (SA-1): getSessionOrg() VÓÓR elke service-role-write; org uit de getrouwde
// sessie (organization_members), NOOIT uit env/client-input. Élke cliënt-ID-mutatie
// scoopt bovendien .eq(organization_id).eq(chatbot_id) op de service-role-query
// (RLS-bypass → object-level guard). Reads via de session-client (RLS); writes via de
// V1 service-role.
//
// ponytail: GEEN per-IP rate-limit hier (V1 mist die infra nog; member-scoped auth +
// de MAX_CRAWL_PAGES-cap zijn de controles). Upgrade-pad: Upstash-ratelimit in de
// V1-hardening-mijlpaal, vóór de eerste echte klant onbewaakt crawlt.

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/v1/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { AppError, isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { purgeAnswerCache } from '@/lib/rag/ingest';
import { getOrgChatbot } from '../rag-config';
import { validateCrawlUrl } from '@/lib/v1/crawler/validateCrawlUrl';
import { normalizeHost } from '@/lib/v1/crawler/normalizeHost';
import { mapSite, startBatchScrape, scrapeOne, MAX_CRAWL_PAGES, MAX_DISCOVER_PAGES } from '@/lib/v1/crawler/firecrawl';
import { ingestSinglePage } from '@/lib/v1/crawler/processCrawl';
import { processCrawlJobs, type OpenJob, JOBS_PER_TICK } from '@/lib/v1/crawler/processJobs';
import { recordCrawlEvent } from '@/lib/v1/crawler/crawlEvents';
import { getWebsiteSources, type WebsiteSource } from './crawl-data';

const KENNISBANK_PATH = '/v1/app/kennisbank';

type V1CrawlCtx = { orgId: string; chatbotId: string; sb: SupabaseClient };

/** Resolve org (uit de sessie) + actieve chatbot + een V1 service-role client. Gooit
 *  AUTH_FORBIDDEN (niet-lid), NEXT_REDIRECT (geen sessie) of NOT_FOUND (geen chatbot). */
async function requireV1OrgChatbot(): Promise<V1CrawlCtx> {
  const { orgId } = await getSessionOrg();
  const sb = getV1ServiceRoleClient();
  const chatbot = await getOrgChatbot(sb, orgId);
  if (!chatbot) throw new AppError('NOT_FOUND', { message: 'Geen chatbot geconfigureerd voor deze org.' });
  return { orgId, chatbotId: chatbot.id, sb };
}

/** Map een auth-fout naar een ActionFail; laat NEXT_REDIRECT (geen sessie) propageren
 *  zodat de redirect naar /v1/login werkt (actionTry zou 'm anders inslikken). */
function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e;
}

/** Kale invoer ("jouwsite.nl") → geldig http(s)-schema. */
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Alleen publieke, SSRF-veilige http(s)-URLs (parallel gevalideerd, SA-2). */
async function filterPublicUrls(urls: string[]): Promise<string[]> {
  const checks = await Promise.all(urls.map(async (u) => ((await validateCrawlUrl(u)).allowed ? u : null)));
  return checks.filter((u): u is string => u !== null);
}

export type DiscoverResult = { rootUrl: string; urls: string[] };

/** Ontdek de pagina's van een site (geen scrape, niets opgeslagen). Alleen auth nodig. */
export async function discoverPagesAction(rawUrl: string): Promise<ActionResult<DiscoverResult>> {
  try {
    await getSessionOrg(); // alleen auth nodig (niets opgeslagen); gate = lid van een org
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const url = normalizeUrl(rawUrl);
    const check = await validateCrawlUrl(url);
    if (!check.allowed) fail('CRAWL_FAILED', check.reason);
    const found = await mapSite(url, MAX_DISCOVER_PAGES);
    // SSRF (SA-2): élke teruggegeven URL opnieuw toetsen — een site kan naar interne hosts linken.
    const validated = await filterPublicUrls([url, ...found]);
    return { rootUrl: url, urls: Array.from(new Set(validated)) };
  });
}

/** Start de batch-scrape van de geselecteerde URLs (BETAALDE Firecrawl-call). */
export async function startSelectedCrawlAction(
  rootUrl: string,
  selectedUrls: string[],
  maxPages: number = MAX_CRAWL_PAGES,
): Promise<ActionResult> {
  let ctx: V1CrawlCtx;
  try {
    ctx = await requireV1OrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const { sb, orgId, chatbotId } = ctx;
    const root = normalizeUrl(rootUrl);
    const rootCheck = await validateCrawlUrl(root);
    if (!rootCheck.allowed) fail('CRAWL_FAILED', rootCheck.reason);

    const cap = Math.min(Math.max(1, Math.floor(maxPages)), MAX_CRAWL_PAGES);
    const safe = (await filterPublicUrls(selectedUrls)).slice(0, cap);
    if (safe.length === 0) fail('CRAWL_FAILED', 'Geen geldige pagina’s geselecteerd.');

    const sourceId = await upsertWebsiteSource(sb, orgId, chatbotId, root, hostnameOf(root));

    let crawlId: string;
    let invalidURLs: string[] = [];
    try {
      ({ crawlId, invalidURLs } = await startBatchScrape(safe));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Crawl kon niet starten.';
      await sb.from('knowledge_sources').update({ status: 'failed' })
        .eq('id', sourceId).eq('organization_id', orgId).eq('chatbot_id', chatbotId);
      await recordCrawlEvent(sb, {
        organizationId: orgId, chatbotId, eventType: 'fail', knowledgeSourceId: sourceId,
        decision: 'start-failed', message: msg, payload: { requestedUrls: safe.length },
      });
      fail('CRAWL_FAILED', msg);
    }

    const { data: job, error: jobErr } = await sb
      .from('processing_jobs')
      .insert({
        organization_id: orgId,
        chatbot_id: chatbotId,
        job_type: 'crawl_website',
        target_type: 'knowledge_source',
        target_id: sourceId,
        status: 'pending',
        external_job_id: crawlId,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (jobErr) throw new Error(`processing_jobs insert: ${jobErr.message}`);

    await recordCrawlEvent(sb, {
      organizationId: orgId, chatbotId, eventType: 'start',
      processingJobId: job.id as string, knowledgeSourceId: sourceId, externalJobId: crawlId,
      message: `Batch-scrape gestart voor ${safe.length} pagina's${invalidURLs.length ? `, ${invalidURLs.length} geweigerd door Firecrawl` : ''}.`,
      payload: { requestedUrls: safe.length, invalidURLs: invalidURLs.slice(0, 60) },
    });

    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

/** Verwijder de website-bron volledig (CASCADE → documents → parent/child-chunks). */
export async function deleteWebsiteSourceAction(sourceId: string): Promise<ActionResult> {
  let ctx: V1CrawlCtx;
  try {
    ctx = await requireV1OrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const { sb, orgId, chatbotId } = ctx;
    const now = new Date().toISOString();
    await sb.from('processing_jobs')
      .update({ status: 'failed', error_message: 'Bron verwijderd tijdens crawl.', finished_at: now, updated_at: now })
      .eq('organization_id', orgId).eq('chatbot_id', chatbotId)
      .eq('job_type', 'crawl_website').eq('target_id', sourceId)
      .in('status', ['pending', 'processing']);
    const { error } = await sb.from('knowledge_sources')
      .delete()
      .eq('id', sourceId).eq('organization_id', orgId).eq('chatbot_id', chatbotId);
    if (error) throw new Error(`knowledge_sources delete: ${error.message}`);
    await purgeAnswerCache(sb, orgId, chatbotId);
    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

/** Leest alle website-bronnen (client-polling). Read via de session-client (RLS). */
export async function refreshWebsiteSources(): Promise<WebsiteSource[]> {
  const ctx = await requireV1OrgChatbot();
  const supabase = await createClient();
  return getWebsiteSources(supabase, ctx.orgId, ctx.chatbotId);
}

/**
 * Client-gedreven "tick": verwerkt openstaande crawl-jobs van deze org+chatbot en
 * geeft de verse bronnenlijst terug. Bewust niet rate-limited (lichte poll). Het
 * verwerken + lezen draait op de service-role (system-processing-pad).
 */
export async function tickCrawlIngestAction(): Promise<WebsiteSource[]> {
  const { sb, orgId, chatbotId } = await requireV1OrgChatbot();
  const { data: jobs, error } = await sb
    .from('processing_jobs')
    .select('id, organization_id, chatbot_id, target_id, external_job_id, attempts, created_at')
    .eq('organization_id', orgId).eq('chatbot_id', chatbotId)
    .eq('job_type', 'crawl_website')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(JOBS_PER_TICK);
  if (error) throw error;
  if (jobs && jobs.length > 0) await processCrawlJobs(sb, jobs as OpenJob[]);
  return getWebsiteSources(sb, orgId, chatbotId);
}

/** Zet één pagina (= website-document) aan/uit in retrieval. */
export async function setPageIncludedAction(pageId: string, included: boolean): Promise<ActionResult> {
  let ctx: V1CrawlCtx;
  try {
    ctx = await requireV1OrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const { sb, orgId, chatbotId } = ctx;
    const { error } = await sb.from('documents')
      .update({ included })
      .eq('id', pageId).eq('organization_id', orgId).eq('chatbot_id', chatbotId).eq('source', 'website');
    if (error) throw new Error(`documents toggle: ${error.message}`);
    // Pagina in/uit retrieval → wat de bot vindt verandert → answer-cache invalideren.
    await purgeAnswerCache(sb, orgId, chatbotId);
    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

/** Herprobeer één mislukte pagina (synchrone scrape + ingest). */
export async function retryPageAction(pageId: string): Promise<ActionResult> {
  let ctx: V1CrawlCtx;
  try {
    ctx = await requireV1OrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const { sb, orgId, chatbotId } = ctx;
    const { data: row } = await sb.from('documents')
      .select('knowledge_source_id, metadata')
      .eq('id', pageId).eq('organization_id', orgId).eq('chatbot_id', chatbotId).eq('source', 'website')
      .maybeSingle();
    if (!row) fail('NOT_FOUND', 'Pagina niet gevonden.');
    const url = ((row.metadata ?? {}) as Record<string, unknown>).source_url as string | undefined;
    const knowledgeSourceId = row.knowledge_source_id as string | null;
    if (!url || !knowledgeSourceId) fail('CRAWL_FAILED', 'Pagina mist een bron-URL of knowledge_source.');
    const check = await validateCrawlUrl(url);
    if (!check.allowed) fail('CRAWL_FAILED', check.reason);
    const page = await scrapeOne(url);
    page.url = page.url || url;
    await ingestSinglePage(sb, knowledgeSourceId, orgId, chatbotId, page);
    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

// ─── helper ────────────────────────────────────────────────────────────────

/** Hergebruikt of maakt de website-bron van de org+chatbot VOOR DIT DOMEIN; status
 *  'crawling'. Match op (org, chatbot, normalized_host) — uniek via index. Race → 23505 → opnieuw lezen. */
async function upsertWebsiteSource(
  sb: SupabaseClient,
  orgId: string,
  chatbotId: string,
  rootUrl: string,
  name: string,
): Promise<string> {
  const host = normalizeHost(rootUrl);
  const now = new Date().toISOString();

  const findExisting = async () => {
    const { data } = await sb.from('knowledge_sources').select('id')
      .eq('organization_id', orgId).eq('chatbot_id', chatbotId)
      .eq('type', 'website').eq('normalized_host', host)
      .is('deleted_at', null).limit(1).maybeSingle();
    return data?.id as string | undefined;
  };

  const existingId = host ? await findExisting() : undefined;
  if (existingId) {
    const { error } = await sb.from('knowledge_sources')
      .update({ root_url: rootUrl, name, status: 'crawling', updated_at: now })
      .eq('id', existingId).eq('organization_id', orgId).eq('chatbot_id', chatbotId);
    if (error) throw new Error(`knowledge_sources update: ${error.message}`);
    return existingId;
  }

  const { data: created, error } = await sb.from('knowledge_sources')
    .insert({ organization_id: orgId, chatbot_id: chatbotId, type: 'website', name, root_url: rootUrl, normalized_host: host, status: 'crawling' })
    .select('id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505' && host) {
      const raced = await findExisting();
      if (raced) {
        await sb.from('knowledge_sources')
          .update({ root_url: rootUrl, name, status: 'crawling', updated_at: now })
          .eq('id', raced).eq('organization_id', orgId).eq('chatbot_id', chatbotId);
        return raced;
      }
    }
    throw new Error(`knowledge_sources insert: ${error.message}`);
  }
  return created.id as string;
}
