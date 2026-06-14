// V0 Website Crawler — gedeelde job-verwerker.
//
// Pollt openstaande crawl-jobs bij Firecrawl en ingest afgeronde crawls.
// Aangeroepen door (a) de client-tick server action tijdens een lopende crawl
// en (b) de cron-route (optioneel, voor een externe pinger). Service-role via
// de meegegeven client (SA-5).
//
// Diagnostiek: elke poll en terminal-beslissing schrijft een crawl_events-rij
// (best-effort) zodat een mislukte/lege crawl achteraf verklaarbaar is.

import 'server-only';

import type { getSystemJobClient } from '@/lib/supabase/admin';
import { getCrawlJobStatus } from '@/lib/v0/crawler/firecrawl';
import { ingestCrawlResults } from '@/lib/v0/crawler/processCrawl';
import { recordCrawlEvent, buildPagesPayload } from '@/lib/v0/crawler/crawlEvents';

type Sb = Awaited<ReturnType<typeof getSystemJobClient>>;

/** Maximale wall-clock duur van een crawl vóór timeout. Bewust GEEN poll-telling
 *  meer: de tick-snelheid varieert (4s client-tick vs 1min cron), waardoor 200
 *  polls ~13min was bij 4s i.p.v. de bedoelde ~1u — een trage maar nog lopende
 *  crawl werd zo onterecht 'failed' gezet (nacht-audit B). Wall-clock is tick-onafhankelijk. */
export const MAX_CRAWL_DURATION_MS = 30 * 60 * 1000; // 30 min

/** Hoeveel jobs per tick verwerkt worden — houdt één invocatie binnen de functietimeout. */
export const JOBS_PER_TICK = 5;

export type OpenJob = {
  id: string;
  organization_id: string;
  target_id: string;
  external_job_id: string | null;
  attempts: number;
  /** Aanmaaktijd van de job — basis voor de wall-clock timeout (MAX_CRAWL_DURATION_MS). */
  created_at: string;
};

export type JobOutcome = { jobId: string; outcome: string; completed: number; total: number };

/** Verwerkt een batch openstaande crawl-jobs. Muteert job- en bron-status. */
export async function processCrawlJobs(sb: Sb, jobs: OpenJob[]): Promise<JobOutcome[]> {
  const now = () => new Date().toISOString();
  const summary: JobOutcome[] = [];

  for (const job of jobs) {
    const { id: jobId, target_id: sourceId, organization_id: orgId } = job;
    const crawlId = job.external_job_id;
    const attempts = job.attempts ?? 0;
    // True zodra DEZE iteratie de ingest-claim won. Bepaalt of de rate-limit-recovery
    // de job mag reopenen: na een eigen claim ('completed') is reopen=eigen retry; zonder
    // claim mag een rate-limit (bv. op de status-call) andermans 'completed' niet reopenen.
    let wonClaim = false;
    const createdMs = new Date(job.created_at).getTime();
    // NaN-guard: een ontbrekende/ongeldige created_at → nooit wall-clock-timeout
    // (liever doorpollen dan een lopende crawl onterecht afbreken).
    const crawlExpired = () => Number.isFinite(createdMs) && Date.now() - createdMs >= MAX_CRAWL_DURATION_MS;

    try {
      if (!crawlId) {
        const msg = 'Geen Firecrawl crawl-ID op de job.';
        await failJob(sb, jobId, sourceId, msg);
        await recordCrawlEvent(sb, {
          organizationId: orgId, eventType: 'fail', processingJobId: jobId,
          knowledgeSourceId: sourceId, decision: 'no-crawl-id', message: msg,
        });
        summary.push({ jobId, outcome: 'failed:no-crawl-id', completed: 0, total: 0 });
        continue;
      }

      const status = await getCrawlJobStatus(crawlId);

      // Gedeelde diagnostiek-velden voor elk event van deze poll.
      const base = {
        organizationId: orgId,
        processingJobId: jobId,
        knowledgeSourceId: sourceId,
        externalJobId: crawlId,
        firecrawlStatus: status.rawStatus,
        completed: status.completed,
        total: status.total,
        dataCount: status.pages.length,
        hasNext: status.hasNext,
        creditsUsed: status.creditsUsed,
      };

      if (status.status === 'scraping') {
        if (crawlExpired()) {
          const mins = Math.round(MAX_CRAWL_DURATION_MS / 60000);
          const msg = `Crawl duurde te lang (timeout na ${mins} min; Firecrawl-status '${status.rawStatus}').`;
          await failJob(sb, jobId, sourceId, msg);
          await recordCrawlEvent(sb, { ...base, eventType: 'fail', decision: 'timeout', message: msg });
          summary.push({ jobId, outcome: 'failed:timeout', completed: status.completed, total: status.total });
        } else {
          await sb
            .from('processing_jobs')
            .update({ status: 'processing', attempts: attempts + 1, updated_at: now() })
            .eq('id', jobId)
            // Status-guard: een poll mag een job die een andere tick intussen claimde
            // ('completed') of afsloot ('failed') NIET terug naar 'processing' zetten —
            // anders reopent dit de job en kan de ingest alsnog dubbel draaien.
            .in('status', ['pending', 'processing']);
          await recordCrawlEvent(sb, { ...base, eventType: 'poll', decision: 'pending' });
          summary.push({ jobId, outcome: 'pending', completed: status.completed, total: status.total });
        }
        continue;
      }

      if (status.status === 'failed') {
        const msg = `Firecrawl meldde status '${status.rawStatus}'.`;
        await failJob(sb, jobId, sourceId, msg);
        await recordCrawlEvent(sb, { ...base, eventType: 'fail', decision: 'firecrawl-failed', message: msg });
        summary.push({ jobId, outcome: 'failed:firecrawl', completed: status.completed, total: status.total });
        continue;
      }

      // completed → ingest. Atomische claim VÓÓR de ingest: meerdere triggers
      // (client-tick + cron + admin-knop) kunnen dezelfde voltooide job oppakken, en
      // ingestCrawlResults doet delete-then-insert → gelijktijdig ingesten geeft dubbele
      // pagina's/chunks + dubbele embed-kost. We flippen de job atomisch uit de open-status
      // (Postgres serialiseert de row-update); alleen de winnaar ingest, de rest skipt.
      // Tradeoff: bij een proces-crash ná de claim maar vóór ingest blijft de job
      // 'completed' zonder data (bron niet 'ready' = zichtbaar signaal) — zeldzaam en
      // herstelbaar via re-crawl; verkozen boven de frequentere dubbel-ingest (nacht-audit A).
      const { data: claimed, error: claimErr } = await sb
        .from('processing_jobs')
        .update({ status: 'completed', attempts: attempts + 1, updated_at: now() })
        .eq('id', jobId)
        .in('status', ['pending', 'processing'])
        .select('id');
      // Een DB-fout op de claim mag NIET als "al geclaimd" gelden (dat zou de ingest
      // stil overslaan → crawl klaar maar geen data). Gooi 'm → de catch retry't.
      if (claimErr) throw new Error(`claim job ${jobId}: ${claimErr.message}`);
      if (!claimed || claimed.length === 0) {
        summary.push({ jobId, outcome: 'skipped:already-claimed', completed: status.completed, total: status.total });
        continue;
      }
      wonClaim = true;
      // Claim gewonnen → eenmalige ingest. Het 'complete'-event bewaart de getrimde
      // pagina-snapshot; bij data_count 0 terwijl total>0/has_next true is dát het signaal.
      const result = await ingestCrawlResults(sb, sourceId, orgId, status.pages);
      await sb
        .from('processing_jobs')
        .update({ finished_at: now(), error_message: null })
        .eq('id', jobId);
      await sb.from('knowledge_sources').update({ status: 'ready', updated_at: now() }).eq('id', sourceId);
      const ingestMsg =
        `${result.pagesCrawled} gecrawld, ${result.pagesFailed} mislukt, ${result.pagesExcluded} leeg → ${result.chunks} chunks.` +
        (result.ingestErrors.length > 0 ? ` ${result.ingestErrors.length} pagina(s) faalden bij verwerking.` : '');
      await recordCrawlEvent(sb, {
        ...base, eventType: 'complete', decision: 'ingested', message: ingestMsg,
        payload: buildPagesPayload(status.pages),
      });
      summary.push({ jobId, outcome: `completed:${result.pagesCrawled}p/${result.chunks}c`, completed: status.completed, total: status.total });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'onbekende fout';
      // Een Firecrawl rate-limit (HTTP 429) is TIJDELIJK: de scrape draait door en
      // de data blijft opvraagbaar. Hem als permanente mislukking behandelen gooide
      // een al-voltooide crawl weg (33 pagina's klaar, job toch 'failed'). Dus: job
      // op 'processing' houden en volgende tick opnieuw pollen tot de limiet reset.
      if (isRateLimited(err) && !crawlExpired()) {
        // Reopen voor retry. Als WIJ de job claimden (ingest-rate-limit ná de claim) mag
        // dat onvoorwaardelijk — het is onze 'completed'. Zonder claim (rate-limit op de
        // status-call vóór de claim) guarden we, zodat we andermans claim niet reopenen.
        let reopen = sb
          .from('processing_jobs')
          .update({ status: 'processing', attempts: attempts + 1, updated_at: now(), error_message: null })
          .eq('id', jobId);
        if (!wonClaim) reopen = reopen.in('status', ['pending', 'processing']);
        await reopen;
        await recordCrawlEvent(sb, {
          organizationId: orgId, eventType: 'poll', processingJobId: jobId,
          knowledgeSourceId: sourceId, externalJobId: crawlId, decision: 'rate-limited', message: msg,
        });
        summary.push({ jobId, outcome: 'pending:rate-limited', completed: 0, total: 0 });
        continue;
      }
      // ownedClaim=wonClaim: als WIJ de job al naar 'completed' claimden en de ingest
      // daarna faalde, moet failJob onze eigen 'completed' alsnog naar 'failed' kunnen
      // zetten (anders blijft de job permanent 'completed' zonder data).
      await failJob(sb, jobId, sourceId, msg, wonClaim);
      await recordCrawlEvent(sb, {
        organizationId: orgId, eventType: 'fail', processingJobId: jobId,
        knowledgeSourceId: sourceId, externalJobId: crawlId, decision: 'exception', message: msg,
      });
      summary.push({ jobId, outcome: 'failed:exception', completed: 0, total: 0 });
    }
  }

  return summary;
}

/**
 * Herkent een Firecrawl rate-limit-fout (HTTP 429). De SDK gooit een SdkError met
 * `.status`/`.statusCode`; de boodschap bevat "Rate limit exceeded". We matchen op
 * beide zodat een toekomstige SDK-shape-wijziging ons niet stilletjes terugzet op
 * "hard falen". Alleen rate-limits → retry; andere fouten blijven fataal.
 */
function isRateLimited(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; statusCode?: number; message?: unknown };
  if (e.status === 429 || e.statusCode === 429) return true;
  return typeof e.message === 'string' && /rate.?limit/i.test(e.message);
}

async function failJob(
  sb: Sb,
  jobId: string,
  sourceId: string,
  message: string,
  ownedClaim = false,
): Promise<void> {
  const now = new Date().toISOString();
  // Status-guard: normaal mag alleen een nog-OPEN job falen — zo overschrijft een trage/
  // stale tick niet andermans 'completed'-claim (en markeert de bron niet onterecht 'failed'
  // terwijl de ingest van een andere tick wél slaagde). Uitzondering: als WIJ de job zelf
  // claimden ('completed') en de ingest daarna faalde, mogen we onze eigen 'completed' alsnog
  // falen — anders blijft de job permanent 'completed' zonder data (nacht-audit A).
  const fromStatuses = ownedClaim ? ['pending', 'processing', 'completed'] : ['pending', 'processing'];
  const { data: failed } = await sb
    .from('processing_jobs')
    .update({ status: 'failed', error_message: message, finished_at: now, updated_at: now })
    .eq('id', jobId)
    .in('status', fromStatuses)
    .select('id');
  if (!failed || failed.length === 0) return; // al geclaimd/afgesloten door een andere tick
  await sb.from('knowledge_sources').update({ status: 'failed', updated_at: now }).eq('id', sourceId);
}
