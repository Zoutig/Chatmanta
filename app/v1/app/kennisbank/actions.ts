'use server';

// V1 Website Crawler — server actions voor het Kennisbank-dashboard (app/v1).
//
// Auth (SA-1): getSessionOrg() VÓÓR elke service-role-write; org uit de getrouwde
// sessie (organization_members), NOOIT uit env/client-input. Élke cliënt-ID-mutatie
// scoopt bovendien .eq(organization_id).eq(chatbot_id) op de service-role-query
// (RLS-bypass → object-level guard). Reads via de session-client (RLS); writes via de
// V1 service-role.
//
// M-C: de crawl-START-actie (startSelectedCrawlAction, raakt Firecrawl + maakt jobs)
// heeft een per-org rate-limit ('crawl:'-bucket, los van het chat-bucket). Lichte polls
// (tick/refresh) blijven bewust ongelimiteerd; Firecrawl-credit-budget zelf = buiten
// scope (puur abuse-rate-limiting van de start). Per-IP rate-limit op acties = V1-
// hardening (V1 mist die infra nog).

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionOrg } from '@/lib/auth';
import { createClient } from '@/lib/supabase/v1/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { AppError, isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { ingestDocument, purgeAnswerCache } from '@/lib/rag/ingest';
import { extractDocText, isAllowedDocExt } from '@/lib/rag/doc-parse';
import { verifyMagicBytes } from '@/lib/rag/file-signature';
import { getOrgChatbot } from '../rag-config';
import { getOrgRateLimiter } from '@/lib/v0/server/rate-limit';
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
  // M-C: per-org abuse-rate-limit op de start-actie (eigen 'crawl:'-bucket). Directe
  // ActionFail (spiegelt authFail's control-flow-return) i.p.v. via actionTry → geen
  // onnodige sink-capture voor een verwacht rate-limit.
  const rl = await getOrgRateLimiter().check(`crawl:${ctx.orgId}`);
  if (!rl.allowed) {
    return {
      ok: false,
      code: 'RATE_LIMIT',
      error: `Te veel crawl-verzoeken — probeer over ${rl.retryAfterSec} ${rl.retryAfterSec === 1 ? 'seconde' : 'seconden'} opnieuw.`,
      retryAfterSec: rl.retryAfterSec,
    };
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

// ─── Document-uploads (PDF/DOCX/TXT/MD ≤10MB via signed Storage-URL) ─────────

const DOC_BUCKET = 'v1-documents';
const MAX_DOC_BYTES = 10 * 1024 * 1024; // mirror van de bucket-cap (file_size_limit)

/** Bestandsnaam → veilig pad-segment (geen slashes/spaties/rare tekens). ALLEEN voor
 *  het Storage-pad — NIET voor weergave (zie displayDocName). */
function safeDocName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'document';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned.slice(-120) || 'document';
}

/** Originele bestandsnaam voor weergave in de docs-lijst (licht getrimd + gecapt).
 *  Houdt spaties/leestekens — alleen het pad-segment moet gesaniteerd zijn. */
function displayDocName(filename: string): string {
  const base = (filename.split(/[\\/]/).pop() ?? '').trim();
  return (base || 'document').slice(0, 200);
}

function docExtOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Stap 1: maak een kortlevende signed upload-URL zodat de browser het bestand
 * DIRECT naar Storage post — NIET via een server-action, want Vercel capt action-
 * bodies op 4,5MB → een 10MB-upload faalt anders stil. Het pad is SERVER-gegenereerd
 * (`<orgId>/<chatbotId>/<uuid>-<naam>`; de klant noemt nooit het pad → geen path-
 * injection), en ext + size worden server-side voorgevalideerd. De harde 10MB-cap zit
 * op de bucket zelf (file_size_limit) — die kan de client niet omzeilen.
 *
 * ponytail: een geüpload-maar-nooit-verwerkt object (tab dicht vóór
 * processUploadedDocAction) blijft een wees in de bucket — geen ingest, dus
 * processUploadedDocAction's finally-remove draait nooit. Opruim-cron is deferred
 * (samen met de delete-doc-UI); upgrade-pad: nightly sweep op objecten ouder dan X
 * zonder bijbehorende documents-rij.
 */
export async function createUploadUrlAction(
  filename: string,
  sizeBytes: number,
): Promise<ActionResult<{ signedUrl: string; token: string; path: string }>> {
  let ctx: V1CrawlCtx;
  try {
    ctx = await requireV1OrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const { sb, orgId, chatbotId } = ctx;
    const ext = docExtOf(filename);
    if (!isAllowedDocExt(ext)) fail('INGEST_TYPE', 'Alleen PDF, DOCX, TXT of MD worden ondersteund.');
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) fail('INPUT_INVALID', 'Ongeldige bestandsgrootte.');
    if (sizeBytes > MAX_DOC_BYTES) fail('INGEST_TOO_LARGE', 'Bestand te groot (max 10 MB).');

    const path = `${orgId}/${chatbotId}/${crypto.randomUUID()}-${safeDocName(filename)}`;
    const { data, error } = await sb.storage.from(DOC_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`createSignedUploadUrl: ${error?.message ?? 'geen URL'}`);
    return { signedUrl: data.signedUrl, token: data.token, path: data.path };
  });
}

/**
 * Stap 2: verwerk het reeds-geüploade bestand. Download via service-role →
 * magic-bytes (defense-in-depth tegen een gespooft MIME/ext) → extractDocText →
 * ingestDocument (org+chatbot-gestempeld) → answer-cache purgen → het ORIGINEEL
 * verwijderen (de chunks zijn de source of truth; AVG-clean, geen ruwe-bestand-store).
 * `path` wordt her-gevalideerd tegen de eigen org/chatbot-prefix: zelfs met een
 * geknutseld pad kan een lid niets buiten z'n eigen namespace lezen (SA-1, RLS-bypass).
 */
export async function processUploadedDocAction(
  path: string,
  filename: string,
): Promise<ActionResult<{ documentId: string; chunks: number }>> {
  let ctx: V1CrawlCtx;
  try {
    ctx = await requireV1OrgChatbot();
  } catch (e) {
    return authFail(e);
  }
  return actionTry(async () => {
    const { sb, orgId, chatbotId } = ctx;
    const ext = docExtOf(filename);
    if (!isAllowedDocExt(ext)) fail('INGEST_TYPE', 'Alleen PDF, DOCX, TXT of MD worden ondersteund.');
    // Het pad MOET in de eigen org/chatbot-namespace liggen (server-gegenereerd in
    // stap 1 — een afwijking = geknutseld). Service-role bypast RLS, dus dit is de guard.
    if (!path.startsWith(`${orgId}/${chatbotId}/`)) fail('AUTH_FORBIDDEN', 'Pad buiten je eigen namespace.');

    const { data: blob, error: dlErr } = await sb.storage.from(DOC_BUCKET).download(path);
    if (dlErr || !blob) fail('NOT_FOUND', `Upload niet gevonden: ${dlErr?.message ?? 'geen bestand'}`);
    const buffer = Buffer.from(await blob.arrayBuffer());

    // Zodra de bytes binnen zijn ruimen we het origineel ALTIJD op (de chunks zijn de
    // source of truth; AVG-clean, geen ruwe-bestand-store). Eén remove in finally dekt
    // élk pad — succes, magic-bytes-fail, lege tekst én een gefaalde ingest (anders
    // bleef het bestand bij een ingest-fout als wees achter). Idempotent: precies één
    // keer. Best-effort — een gefaalde remove mag de echte fout/het resultaat niet maskeren.
    try {
      if (!verifyMagicBytes(buffer, ext)) {
        fail('INGEST_TYPE', 'Bestandsinhoud komt niet overeen met het bestandstype.');
      }

      const text = await extractDocText(buffer, ext);
      if (!text.trim()) {
        fail('INGEST_READ_FAILED', 'Geen tekst gevonden in het bestand (gescande PDF zonder tekstlaag?).');
      }

      const res = await ingestDocument(sb, {
        organizationId: orgId,
        chatbotId,
        filename: displayDocName(filename),
        text,
        source: 'upload',
      });
      await purgeAnswerCache(sb, orgId, chatbotId);
      revalidatePath(KENNISBANK_PATH);
      return { documentId: res.documentId, chunks: res.chunks };
    } finally {
      const { error: rmErr } = await sb.storage.from(DOC_BUCKET).remove([path]);
      if (rmErr) console.warn(`[processUploadedDocAction] origineel verwijderen faalde voor ${path}: ${rmErr.message}`);
    }
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
