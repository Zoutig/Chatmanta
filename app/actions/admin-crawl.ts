'use server';

// Admin Dashboard — bronbeheer per klant (taak 2).
//
// Org komt uit de route-param (niet de active-org cookie). requireV0Auth +
// org-validatie tegen KNOWN_ORGS vóór elke write — de service-role wrappers
// bypassen RLS, dus deze gate is de daadwerkelijke isolatie (defense-in-depth
// boven proxy.ts), exact zoals app/actions/controlroom.ts.
//
// DEACTIVEREN ≠ VERWIJDEREN. Deactiveren zet knowledge_sources.disabled_at én alle
// website_pages.included=false → de bron valt via de bestaande match_chunks_*-
// filter (0035) buiten de retrieval, maar blijft bestaan en is heractiveerbaar.
// Verwijderen is de harde delete (CASCADE → pages → chunks).
//
// Documenten (platte tekst), beheer van bestaande bronnen (inactief/verwijderen/
// per-pagina), én een nieuwe website crawlen (discover → batch-scrape → job; ingest
// via "Verwerk openstaande crawls" op /jobs of de cron-pinger).

import { revalidatePath } from 'next/cache';
import { KNOWN_ORGS, resolveOrgIdFromSlug } from '@/lib/v0/server/active-org';
import { getSystemJobClient } from '@/lib/supabase/admin';
import { ingestText, deleteDoc } from '@/lib/v0/server/rag';
import { extractDocText, isAllowedDocExt } from '@/lib/v0/server/doc-parse';
import { mapSite, startBatchScrape, MAX_CRAWL_PAGES, MAX_DISCOVER_PAGES } from '@/lib/v0/crawler/firecrawl';
import { validateCrawlUrl } from '@/lib/v0/crawler/validateCrawlUrl';
import { recordCrawlEvent } from '@/lib/v0/crawler/crawlEvents';
import { processCrawlJobs, type OpenJob, JOBS_PER_TICK } from '@/lib/v0/crawler/processJobs';
import { normalizeHost } from '@/lib/v0/crawler/normalizeHost';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';
import { requireV0Auth } from './_auth';

type SbClient = Awaited<ReturnType<typeof getSystemJobClient>>;

/** Houd alleen publieke, SSRF-veilige http(s)-URLs over (parallel gevalideerd). */
async function filterPublicUrls(urls: string[]): Promise<string[]> {
  const checks = await Promise.all(
    urls.map(async (u) => ((await validateCrawlUrl(u)).allowed ? u : null)),
  );
  return checks.filter((u): u is string => u !== null);
}

/** Zorgt dat een kale invoer ("jouwsite.nl") een geldig http(s)-schema krijgt. */
function normalizeUrl(input: string): string {
  const t = input.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Hergebruikt of maakt de website-bron van de org voor dit domein; zet status
 *  'crawling' (+ clear disabled_at). Match op normalized_host (uniek per org, index
 *  0037). Spiegelt de private helper in app/actions/crawl.ts (V0: duplicate is ok). */
async function upsertWebsiteSource(sb: SbClient, orgId: string, rootUrl: string, name: string): Promise<string> {
  const host = normalizeHost(rootUrl);
  const now = new Date().toISOString();
  const findExisting = async () => {
    const { data } = await sb
      .from('knowledge_sources')
      .select('id')
      .eq('organization_id', orgId)
      .eq('type', 'website')
      .eq('normalized_host', host)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    return data?.id as string | undefined;
  };
  const existingId = host ? await findExisting() : undefined;
  if (existingId) {
    const { error } = await sb
      .from('knowledge_sources')
      .update({ root_url: rootUrl, name, status: 'crawling', disabled_at: null, updated_at: now })
      .eq('id', existingId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`knowledge_sources update: ${error.message}`);
    return existingId;
  }
  const { data: created, error } = await sb
    .from('knowledge_sources')
    .insert({ organization_id: orgId, type: 'website', name, root_url: rootUrl, normalized_host: host, status: 'crawling' })
    .select('id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505' && host) {
      const raced = await findExisting();
      if (raced) {
        await sb.from('knowledge_sources').update({ root_url: rootUrl, name, status: 'crawling', disabled_at: null, updated_at: now }).eq('id', raced).eq('organization_id', orgId);
        return raced;
      }
    }
    throw new Error(`knowledge_sources insert: ${error.message}`);
  }
  return created.id as string;
}

/** Valideer de org-slug tegen KNOWN_ORGS en geef de stabiele UUID terug. */
function requireKnownOrgId(slug: string): string {
  if (!(slug in KNOWN_ORGS)) fail('NOT_FOUND', `unknown org slug: ${slug}`);
  const id = resolveOrgIdFromSlug(slug);
  if (!id) fail('NOT_FOUND', `unresolvable org slug: ${slug}`);
  return id;
}

function revalidate(slug: string) {
  revalidatePath('/admindashboard', 'layout');
  revalidatePath(`/admindashboard/klanten/${slug}`);
}

/** Bovengrens voor een geüpload document (10 MB). */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Reconstrueert leesbare tekst uit opgeslagen chunks (het origineel wordt in V0 niet
 * bewaard). chunkText laat opeenvolgende chunks ~200 tekens overlappen; we knippen de
 * grootste suffix-die-ook-prefix-is weg zodat de weergave niet dubbelt.
 */
function reconstructFromChunks(chunks: string[]): string {
  if (chunks.length === 0) return '';
  let out = chunks[0];
  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i];
    const max = Math.min(out.length, next.length, 500);
    let overlap = 0;
    for (let k = max; k > 20; k--) {
      if (out.slice(out.length - k) === next.slice(0, k)) {
        overlap = k;
        break;
      }
    }
    out += next.slice(overlap);
  }
  return out;
}

/**
 * Activeer/deactiveer een website-bron. Deactiveren = disabled_at zetten + alle
 * pagina's included=false (bot gebruikt de bron niet meer); reactiveren = omgekeerd.
 * NB: per-pagina handmatige uitsluitingen gaan bij reactiveren verloren (alles weer
 * included=true) — bewuste V0-vereenvoudiging.
 */
export async function adminSetWebsiteSourceActiveAction(
  orgSlug: string,
  sourceId: string,
  active: boolean,
): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const sb = await getSystemJobClient({ reason: 'admin_toggle_source' });
    const now = new Date().toISOString();
    const { error: srcErr } = await sb
      .from('knowledge_sources')
      .update({ disabled_at: active ? null : now, updated_at: now })
      .eq('id', sourceId)
      .eq('organization_id', orgId);
    if (srcErr) throw new Error(`knowledge_sources toggle: ${srcErr.message}`);
    // Retrieval-uitsluiting via de bestaande website_pages.included-filter.
    const { error: pgErr } = await sb
      .from('website_pages')
      .update({ included: active })
      .eq('knowledge_source_id', sourceId)
      .eq('organization_id', orgId);
    if (pgErr) throw new Error(`website_pages bulk include: ${pgErr.message}`);
    revalidate(orgSlug);
    return {};
  });
}

/** Per-pagina include-toggle — fijnmazig "bewerken" van een website-bron. */
export async function adminSetPageIncludedAction(
  orgSlug: string,
  pageId: string,
  included: boolean,
): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const sb = await getSystemJobClient({ reason: 'admin_toggle_page' });
    const { error } = await sb
      .from('website_pages')
      .update({ included })
      .eq('id', pageId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`website_pages toggle: ${error.message}`);
    revalidate(orgSlug);
    return {};
  });
}

/** Verwijder een website-bron volledig (CASCADE → pages → chunks). Bevestiging in de UI. */
export async function adminDeleteWebsiteSourceAction(
  orgSlug: string,
  sourceId: string,
): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const sb = await getSystemJobClient({ reason: 'admin_delete_source' });
    const now = new Date().toISOString();
    // Lopende jobs eerst afsluiten zodat een crawl niet doorloopt op een verwijderde bron.
    await sb
      .from('processing_jobs')
      .update({ status: 'failed', error_message: 'Bron verwijderd via admin.', finished_at: now, updated_at: now })
      .eq('organization_id', orgId)
      .eq('job_type', 'crawl_website')
      .eq('target_id', sourceId)
      .in('status', ['pending', 'processing']);
    const { error } = await sb
      .from('knowledge_sources')
      .delete()
      .eq('id', sourceId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`knowledge_sources delete: ${error.message}`);
    revalidate(orgSlug);
    return {};
  });
}

/** Voeg een document toe vanuit platte tekst (ingestText embed't + chunked). */
export async function adminAddDocTextAction(
  orgSlug: string,
  filename: string,
  text: string,
): Promise<ActionResult<{ docId: string; chunks: number }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const name = filename.trim() || 'Tekstdocument';
    // ingestText valideert lege tekst zelf (INGEST_READ_FAILED na trimmen).
    const res = await ingestText({ filename: name, text, organizationId: orgId });
    revalidate(orgSlug);
    return { docId: res.docId, chunks: res.chunks };
  });
}

/** Verwijder een document (CASCADE → chunks). Bevestiging in de UI. */
export async function adminDeleteDocAction(orgSlug: string, docId: string): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    await deleteDoc(docId, orgId);
    revalidate(orgSlug);
    return {};
  });
}

/**
 * Upload een echt document (PDF/DOCX/TXT/MD): extraheer de tekst en ingest 'm (chunk +
 * embed) net als een geplakt tekstdocument. Org uit de route-param. Consistent met de
 * klantendashboard-kennisbank-bestandstypes, maar dit is het eerste pad dat de upload
 * écht verwerkt (de klant-UI was tot nu toe een mock).
 */
export async function adminUploadDocAction(
  orgSlug: string,
  formData: FormData,
): Promise<ActionResult<{ docId: string; chunks: number; filename: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) fail('INPUT_INVALID', 'Geen bestand ontvangen.');
    if (file.size > MAX_UPLOAD_BYTES) {
      fail('INGEST_TOO_LARGE', `Bestand te groot (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);
    }
    const filename = (file.name || 'document').trim();
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    if (!isAllowedDocExt(ext)) fail('INGEST_TYPE', 'Alleen PDF, DOCX, TXT of MD worden ondersteund.');

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractDocText(buffer, ext);
    if (!text.trim()) {
      fail('INGEST_READ_FAILED', 'Geen tekst gevonden in het bestand (gescande PDF zonder tekstlaag?).');
    }

    const res = await ingestText({ filename, text, organizationId: orgId });
    revalidate(orgSlug);
    return { docId: res.docId, chunks: res.chunks, filename };
  });
}

/** Lees de inhoud van een document terug (gereconstrueerd uit de opgeslagen chunks). */
export async function adminGetDocContentAction(
  orgSlug: string,
  docId: string,
): Promise<ActionResult<{ filename: string; text: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const sb = await getSystemJobClient({ reason: 'admin_view_doc' });
    const { data: doc } = await sb
      .from('documents')
      .select('filename')
      .eq('id', docId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!doc) fail('NOT_FOUND', 'Document niet gevonden.');
    const { data: rows, error } = await sb
      .from('document_chunks')
      .select('content, metadata')
      .eq('document_id', docId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`document_chunks read: ${error.message}`);
    const ordered = (rows ?? [])
      .map((r) => ({
        idx: Number((r.metadata as { chunk_index?: number } | null)?.chunk_index ?? 0),
        content: (r.content as string) ?? '',
      }))
      .sort((a, b) => a.idx - b.idx);
    return { filename: doc.filename as string, text: reconstructFromChunks(ordered.map((o) => o.content)) };
  });
}

/** Lees de gecrawlde inhoud van één website-pagina terug (content_text). */
export async function adminGetPageContentAction(
  orgSlug: string,
  pageId: string,
): Promise<ActionResult<{ title: string; url: string; text: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const sb = await getSystemJobClient({ reason: 'admin_view_page' });
    const { data: pg } = await sb
      .from('website_pages')
      .select('title, url, content_text')
      .eq('id', pageId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!pg) fail('NOT_FOUND', 'Pagina niet gevonden.');
    return {
      title: (pg.title as string | null) ?? '',
      url: pg.url as string,
      text: (pg.content_text as string | null) ?? '',
    };
  });
}

// ───────────────────────── Crawl & Jobs (taak 5) ──────────────────────────

/** Valideer dat een org-UUID bij een bekende V0-org hoort (defense-in-depth). */
function assertKnownOrgId(orgId: string) {
  const known = Object.values(KNOWN_ORGS).some((o) => o.id === orgId);
  if (!known) fail('NOT_FOUND', `unknown organization_id: ${orgId}`);
}

/**
 * Herstart een gefaalde/oude crawl-job. Hergebruikt de bestaande pagina-URLs van
 * de bron (of ontdekt opnieuw via de root als er nog geen pagina's zijn) en zet een
 * verse batch-scrape + processing_job op. Ingest gebeurt daarna via "Verwerk
 * openstaande crawls" of de cron-pinger. BETAALDE Firecrawl-call — bewust admin-actie.
 */
export async function adminRerunCrawlAction(jobId: string): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    const sb = await getSystemJobClient({ reason: 'admin_rerun_crawl' });
    const { data: job } = await sb
      .from('processing_jobs')
      .select('organization_id, target_id')
      .eq('id', jobId)
      .eq('job_type', 'crawl_website')
      .maybeSingle();
    if (!job) fail('NOT_FOUND', 'Job niet gevonden.');
    const orgId = job.organization_id as string;
    assertKnownOrgId(orgId);
    const sourceId = job.target_id as string;

    const { data: src } = await sb
      .from('knowledge_sources')
      .select('root_url, normalized_host')
      .eq('id', sourceId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!src) fail('NOT_FOUND', 'Bron niet gevonden of verwijderd.');
    const root =
      (src.root_url as string | null) ??
      (src.normalized_host ? `https://${src.normalized_host as string}` : null);

    // URLs: bestaande pagina's hergebruiken; anders opnieuw ontdekken via de root.
    const { data: pages } = await sb
      .from('website_pages')
      .select('url')
      .eq('knowledge_source_id', sourceId)
      .eq('organization_id', orgId)
      .is('deleted_at', null);
    let urls = (pages ?? []).map((p) => p.url as string);
    if (urls.length === 0) {
      if (!root) fail('CRAWL_FAILED', 'Geen pagina-URLs en geen root-URL om opnieuw te crawlen.');
      const rootCheck = await validateCrawlUrl(root);
      if (!rootCheck.allowed) fail('CRAWL_FAILED', rootCheck.reason);
      urls = [root, ...(await mapSite(root, MAX_DISCOVER_PAGES))];
    }
    const safe = (await filterPublicUrls(urls)).slice(0, MAX_CRAWL_PAGES);
    if (safe.length === 0) fail('CRAWL_FAILED', 'Geen geldige pagina’s om te crawlen.');

    const now = new Date().toISOString();
    await sb.from('knowledge_sources').update({ status: 'crawling', updated_at: now }).eq('id', sourceId).eq('organization_id', orgId);

    let crawlId: string;
    let invalidURLs: string[] = [];
    try {
      ({ crawlId, invalidURLs } = await startBatchScrape(safe));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Crawl kon niet starten.';
      await sb.from('knowledge_sources').update({ status: 'failed' }).eq('id', sourceId).eq('organization_id', orgId);
      await recordCrawlEvent(sb, {
        organizationId: orgId, eventType: 'fail', knowledgeSourceId: sourceId,
        decision: 'start-failed', message: msg, payload: { requestedUrls: safe.length, rerun: true },
      });
      fail('CRAWL_FAILED', msg);
    }

    const { data: newJob, error: jobErr } = await sb
      .from('processing_jobs')
      .insert({
        organization_id: orgId, job_type: 'crawl_website', target_type: 'knowledge_source',
        target_id: sourceId, status: 'pending', external_job_id: crawlId, started_at: now,
      })
      .select('id')
      .single();
    if (jobErr) throw new Error(`processing_jobs insert: ${jobErr.message}`);

    await recordCrawlEvent(sb, {
      organizationId: orgId, eventType: 'start', processingJobId: newJob.id as string,
      knowledgeSourceId: sourceId, externalJobId: crawlId,
      message: `Opnieuw gestart via admin voor ${safe.length} pagina's${invalidURLs.length ? `, ${invalidURLs.length} geweigerd door Firecrawl` : ''}.`,
      payload: { requestedUrls: safe.length, rerun: true },
    });

    revalidatePath('/admindashboard', 'layout');
    return {};
  });
}

/**
 * Verwerk openstaande crawl-jobs (cross-org) — dezelfde motor als de cron, maar
 * admin-getriggerd. Pollt Firecrawl + ingest afgeronde crawls. Geeft het aantal
 * verwerkte jobs terug.
 */
export async function adminProcessOpenCrawlsAction(): Promise<ActionResult<{ processed: number }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const sb = await getSystemJobClient({ reason: 'admin_process_open_crawls' });
    const { data: jobs, error } = await sb
      .from('processing_jobs')
      .select('id, organization_id, target_id, external_job_id, attempts')
      .eq('job_type', 'crawl_website')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })
      .limit(JOBS_PER_TICK);
    if (error) throw error;
    let processed = 0;
    if (jobs && jobs.length > 0) {
      const summary = await processCrawlJobs(sb, jobs as OpenJob[]);
      processed = summary.length;
    }
    revalidatePath('/admindashboard', 'layout');
    return { processed };
  });
}

/**
 * Voeg een nieuwe website-bron toe en start direct een crawl: discover (mapSite +
 * sitemap) → publieke URLs (SSRF-gevalideerd, gecapt op MAX_CRAWL_PAGES) → batch-scrape
 * → processing_job(pending). Ingest gebeurt via "Verwerk openstaande crawls" (/jobs)
 * of de cron-pinger. BETAALDE Firecrawl-call — bewust admin-getriggerd.
 */
export async function adminStartCrawlAction(
  orgSlug: string,
  rawUrl: string,
): Promise<ActionResult<{ discovered: number }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const root = normalizeUrl(rawUrl);
    const rootCheck = await validateCrawlUrl(root);
    if (!rootCheck.allowed) fail('CRAWL_FAILED', rootCheck.reason);

    const discovered = await mapSite(root, MAX_DISCOVER_PAGES);
    const safe = (await filterPublicUrls([root, ...discovered])).slice(0, MAX_CRAWL_PAGES);
    if (safe.length === 0) fail('CRAWL_FAILED', 'Geen geldige pagina’s gevonden om te crawlen.');

    const sb = await getSystemJobClient({ reason: 'admin_start_crawl' });
    const sourceId = await upsertWebsiteSource(sb, orgId, root, hostnameOf(root));

    let crawlId: string;
    let invalidURLs: string[] = [];
    try {
      ({ crawlId, invalidURLs } = await startBatchScrape(safe));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Crawl kon niet starten.';
      await sb.from('knowledge_sources').update({ status: 'failed' }).eq('id', sourceId).eq('organization_id', orgId);
      await recordCrawlEvent(sb, {
        organizationId: orgId, eventType: 'fail', knowledgeSourceId: sourceId,
        decision: 'start-failed', message: msg, payload: { requestedUrls: safe.length },
      });
      fail('CRAWL_FAILED', msg);
    }

    const { data: job, error: jobErr } = await sb
      .from('processing_jobs')
      .insert({
        organization_id: orgId, job_type: 'crawl_website', target_type: 'knowledge_source',
        target_id: sourceId, status: 'pending', external_job_id: crawlId, started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (jobErr) throw new Error(`processing_jobs insert: ${jobErr.message}`);

    await recordCrawlEvent(sb, {
      organizationId: orgId, eventType: 'start', processingJobId: job.id as string,
      knowledgeSourceId: sourceId, externalJobId: crawlId,
      message: `Crawl gestart via admin voor ${safe.length} pagina's${invalidURLs.length ? `, ${invalidURLs.length} geweigerd door Firecrawl` : ''}.`,
      payload: { requestedUrls: safe.length },
    });

    revalidate(orgSlug);
    return { discovered: safe.length };
  });
}
