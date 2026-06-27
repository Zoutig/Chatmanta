// V1 Website Crawler — gedeelde job-verwerker.
//
// Pollt openstaande crawl-jobs bij Firecrawl en ingest afgeronde crawls. Aangeroepen
// door (a) de client-tick server action tijdens een lopende crawl en (b) de cron-route
// (externe pinger). Service-role via de MEEGEGEVEN client (SA-5 DI). Org+chatbot komen
// uit de processing_jobs-rij en worden op elke ingest/diagnostiek-rij gestempeld.
//
// Atomische claim + wall-clock-timeout + finalize-retry + rate-limit-recovery: 1:1
// geport uit V0 (nacht-audit A/B-fixes) — NIET vereenvoudigen.

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCrawlJobStatus } from './firecrawl';
import { ingestCrawlResults } from './processCrawl';
import { recordCrawlEvent, buildPagesPayload } from './crawlEvents';

type Sb = SupabaseClient;

/** Wall-clock duur vóór timeout (tick-onafhankelijk; geen poll-telling — nacht-audit B). */
export const MAX_CRAWL_DURATION_MS = 30 * 60 * 1000; // 30 min

/** Jobs per tick — houdt één invocatie binnen de functietimeout. */
export const JOBS_PER_TICK = 5;

export type OpenJob = {
  id: string;
  organization_id: string;
  chatbot_id: string;
  target_id: string;
  external_job_id: string | null;
  attempts: number;
  created_at: string;
};

export type JobOutcome = { jobId: string; outcome: string; completed: number; total: number };

/** Verwerkt een batch openstaande crawl-jobs. Muteert job- en bron-status. */
export async function processCrawlJobs(sb: Sb, jobs: OpenJob[]): Promise<JobOutcome[]> {
  const now = () => new Date().toISOString();
  const summary: JobOutcome[] = [];

  for (const job of jobs) {
    const { id: jobId, target_id: sourceId, organization_id: orgId, chatbot_id: chatbotId } = job;
    const crawlId = job.external_job_id;
    const attempts = job.attempts ?? 0;
    let wonClaim = false;
    const createdMs = new Date(job.created_at).getTime();
    const crawlExpired = () => Number.isFinite(createdMs) && Date.now() - createdMs >= MAX_CRAWL_DURATION_MS;

    try {
      if (!crawlId) {
        const msg = 'Geen Firecrawl crawl-ID op de job.';
        await failJob(sb, jobId, sourceId, orgId, chatbotId, msg);
        await recordCrawlEvent(sb, {
          organizationId: orgId, chatbotId, eventType: 'fail', processingJobId: jobId,
          knowledgeSourceId: sourceId, decision: 'no-crawl-id', message: msg,
        });
        summary.push({ jobId, outcome: 'failed:no-crawl-id', completed: 0, total: 0 });
        continue;
      }

      // defense-in-depth: target_id heeft geen tenant-FK — verifieer dat de bron een
      // website-bron van DEZELFDE org+chatbot is, zodat een gedrifte/foutgelabelde job
      // nooit andermans bron muteert of er content aan koppelt.
      const { data: srcRow, error: srcErr } = await sb
        .from('knowledge_sources').select('id')
        .eq('id', sourceId).eq('organization_id', orgId).eq('chatbot_id', chatbotId)
        .eq('type', 'website').is('deleted_at', null).maybeSingle();
      // Een DB-fout ≠ "bron niet gevonden": gooi 'm → de outer catch behandelt 'm als
      // exception (rate-limit-retry / nette fail met de echte boodschap) i.p.v. de job
      // onterecht als tenant-mismatch te falen.
      if (srcErr) throw new Error(`source lookup ${sourceId}: ${srcErr.message}`);
      if (!srcRow) {
        await failJob(sb, jobId, sourceId, orgId, chatbotId, 'Bron niet gevonden voor deze org/chatbot.');
        await recordCrawlEvent(sb, {
          organizationId: orgId, chatbotId, eventType: 'fail', processingJobId: jobId,
          knowledgeSourceId: sourceId, decision: 'start-failed', message: 'source-tenant-mismatch',
        });
        summary.push({ jobId, outcome: 'failed:source-mismatch', completed: 0, total: 0 });
        continue;
      }

      const status = await getCrawlJobStatus(crawlId);

      const base = {
        organizationId: orgId,
        chatbotId,
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
          await failJob(sb, jobId, sourceId, orgId, chatbotId, msg);
          await recordCrawlEvent(sb, { ...base, eventType: 'fail', decision: 'timeout', message: msg });
          summary.push({ jobId, outcome: 'failed:timeout', completed: status.completed, total: status.total });
        } else {
          await sb
            .from('processing_jobs')
            .update({ status: 'processing', attempts: attempts + 1, updated_at: now() })
            .eq('id', jobId)
            // Status-guard: een poll mag een job die een andere tick claimde/afsloot niet
            // terug naar 'processing' zetten — anders kan de ingest dubbel draaien.
            .in('status', ['pending', 'processing']);
          await recordCrawlEvent(sb, { ...base, eventType: 'poll', decision: 'pending' });
          summary.push({ jobId, outcome: 'pending', completed: status.completed, total: status.total });
        }
        continue;
      }

      if (status.status === 'failed') {
        const msg = `Firecrawl meldde status '${status.rawStatus}'.`;
        await failJob(sb, jobId, sourceId, orgId, chatbotId, msg);
        await recordCrawlEvent(sb, { ...base, eventType: 'fail', decision: 'firecrawl-failed', message: msg });
        summary.push({ jobId, outcome: 'failed:firecrawl', completed: status.completed, total: status.total });
        continue;
      }

      // completed → ingest. Atomische claim VÓÓR de ingest: meerdere triggers
      // (client-tick + cron) kunnen dezelfde voltooide job oppakken, en ingestCrawlResults
      // doet delete-then-insert → gelijktijdig ingesten geeft dubbele rijen + dubbele
      // embed-kost. We flippen de job atomisch uit de open-status; alleen de winnaar ingest.
      const { data: claimed, error: claimErr } = await sb
        .from('processing_jobs')
        .update({ status: 'completed', attempts: attempts + 1, updated_at: now() })
        .eq('id', jobId)
        .in('status', ['pending', 'processing'])
        .select('id');
      if (claimErr) throw new Error(`claim job ${jobId}: ${claimErr.message}`);
      if (!claimed || claimed.length === 0) {
        summary.push({ jobId, outcome: 'skipped:already-claimed', completed: status.completed, total: status.total });
        continue;
      }
      wonClaim = true;
      const result = await ingestCrawlResults(sb, sourceId, orgId, chatbotId, status.pages);
      // Bron op 'ready' = de finaliserende stap (job is al 'completed' via de claim).
      const { error: readyErr } = await sb
        .from('knowledge_sources')
        .update({ status: 'ready', updated_at: now() })
        .eq('id', sourceId).eq('organization_id', orgId).eq('chatbot_id', chatbotId);
      if (readyErr) {
        if (crawlExpired()) {
          await failJob(sb, jobId, sourceId, orgId, chatbotId, `Bron-finalisatie bleef falen: ${readyErr.message}`, true);
          await recordCrawlEvent(sb, { ...base, eventType: 'fail', decision: 'finalize-failed', message: readyErr.message });
          summary.push({ jobId, outcome: 'failed:finalize', completed: status.completed, total: status.total });
        } else {
          // Heropenen mag onvoorwaardelijk: wij wonnen de claim, dit is onze eigen 'completed'.
          await sb.from('processing_jobs').update({ status: 'processing', updated_at: now() }).eq('id', jobId);
          await recordCrawlEvent(sb, { ...base, eventType: 'poll', decision: 'finalize-retry', message: readyErr.message });
          summary.push({ jobId, outcome: 'retry:finalize', completed: status.completed, total: status.total });
        }
        continue;
      }
      await sb.from('processing_jobs').update({ finished_at: now(), error_message: null }).eq('id', jobId);
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
      // Firecrawl rate-limit (429) is TIJDELIJK: job op 'processing' houden + volgende tick
      // opnieuw pollen tot de limiet reset (een al-voltooide crawl niet weggooien).
      if (isRateLimited(err) && !crawlExpired()) {
        let reopen = sb
          .from('processing_jobs')
          .update({ status: 'processing', attempts: attempts + 1, updated_at: now(), error_message: null })
          .eq('id', jobId);
        if (!wonClaim) reopen = reopen.in('status', ['pending', 'processing']);
        await reopen;
        await recordCrawlEvent(sb, {
          organizationId: orgId, chatbotId, eventType: 'poll', processingJobId: jobId,
          knowledgeSourceId: sourceId, externalJobId: crawlId, decision: 'rate-limited', message: msg,
        });
        summary.push({ jobId, outcome: 'pending:rate-limited', completed: 0, total: 0 });
        continue;
      }
      // ownedClaim=wonClaim: als WIJ de job naar 'completed' claimden en de ingest daarna
      // faalde, mag failJob onze eigen 'completed' alsnog naar 'failed' zetten.
      await failJob(sb, jobId, sourceId, orgId, chatbotId, msg, wonClaim);
      await recordCrawlEvent(sb, {
        organizationId: orgId, chatbotId, eventType: 'fail', processingJobId: jobId,
        knowledgeSourceId: sourceId, externalJobId: crawlId, decision: 'exception', message: msg,
      });
      summary.push({ jobId, outcome: 'failed:exception', completed: 0, total: 0 });
    }
  }

  return summary;
}

/** Herkent een Firecrawl rate-limit-fout (HTTP 429) op .status/.statusCode of de message. */
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
  orgId: string,
  chatbotId: string,
  message: string,
  ownedClaim = false,
): Promise<void> {
  const now = new Date().toISOString();
  // Status-guard: normaal mag alleen een nog-OPEN job falen (geen andermans 'completed'
  // overschrijven). Uitzondering: als WIJ claimden ('completed') en de ingest faalde,
  // mogen we onze eigen 'completed' alsnog falen (anders permanent 'completed' zonder data).
  const fromStatuses = ownedClaim ? ['pending', 'processing', 'completed'] : ['pending', 'processing'];
  const { data: failed } = await sb
    .from('processing_jobs')
    .update({ status: 'failed', error_message: message, finished_at: now, updated_at: now })
    .eq('id', jobId)
    .in('status', fromStatuses)
    .select('id');
  if (!failed || failed.length === 0) return; // al geclaimd/afgesloten door een andere tick
  await sb.from('knowledge_sources').update({ status: 'failed', updated_at: now })
    .eq('id', sourceId).eq('organization_id', orgId).eq('chatbot_id', chatbotId);
}
