import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { formatDateTime } from '../_ui/format';
import { JobsClient, type JobRow } from './jobs-client';
import Link from 'next/link';

// V1 admin — cross-org crawl-jobs + retry. Reads via getJorionAdminClient() (service-role
// NÁ requireJorionAdmin; admin is geen org-member → RLS-session-client zou 0 rijen geven).
export const dynamic = 'force-dynamic';

const JOB_LIMIT = 50;

type JobDb = {
  id: string;
  organization_id: string;
  target_id: string | null;
  status: JobRow['status'];
  attempts: number | null;
  error_message: string | null;
  created_at: string;
  organizations: { name: string } | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const sp = await searchParams;
  // ?org=<uuid>: alleen de crawls van één klant (link vanaf de klant-detail).
  const orgFilter = sp.org && UUID_RE.test(sp.org) ? sp.org : null;
  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e; // NEXT_REDIRECT → /v1/login
  }

  let jobsQuery = admin
    .from('processing_jobs')
    .select('id, organization_id, target_id, status, attempts, error_message, created_at, organizations(name)')
    .eq('job_type', 'crawl_website');
  if (orgFilter) jobsQuery = jobsQuery.eq('organization_id', orgFilter);
  const { data: jobsData, error } = await jobsQuery.order('created_at', { ascending: false }).limit(JOB_LIMIT);
  const jobs = (jobsData ?? []) as unknown as JobDb[];

  // Bron-host per job (target_id → knowledge_source). Eén lookup voor alle getoonde jobs.
  const sourceIds = [...new Set(jobs.map((j) => j.target_id).filter((x): x is string => !!x))];
  const hostById = new Map<string, string | null>();
  if (sourceIds.length > 0) {
    const { data: srcs } = await admin
      .from('knowledge_sources')
      .select('id, normalized_host, root_url')
      .in('id', sourceIds);
    for (const s of (srcs ?? []) as Array<{ id: string; normalized_host: string | null; root_url: string | null }>) {
      hostById.set(s.id, s.normalized_host ?? s.root_url ?? null);
    }
  }

  // Laatste crawl_event per job (decision/message) — recente set, eerste = nieuwste.
  const lastEventByJob = new Map<string, string | null>();
  const { data: events } = await admin
    .from('crawl_events')
    .select('processing_job_id, decision, message, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  for (const ev of (events ?? []) as Array<{ processing_job_id: string | null; decision: string | null; message: string | null }>) {
    if (!ev.processing_job_id || lastEventByJob.has(ev.processing_job_id)) continue;
    lastEventByJob.set(ev.processing_job_id, ev.message ?? ev.decision ?? null);
  }

  const rows: JobRow[] = jobs.map((j) => ({
    jobId: j.id,
    orgName: j.organizations?.name ?? 'Onbekende klant',
    host: j.target_id ? hostById.get(j.target_id) ?? null : null,
    status: j.status,
    attempts: j.attempts ?? 0,
    errorMessage: j.error_message,
    // Op de server opgemaakt: Node en de browser formatteren datums net anders (hydration).
    createdLabel: formatDateTime(j.created_at),
    lastEvent: lastEventByJob.get(j.id) ?? null,
  }));

  return (
    <div className="v1-page">
      <PageHeader
        title="Crawls en taken"
        description={
          orgFilter
            ? `Website-crawls van ${jobs[0]?.organizations?.name ?? 'deze klant'}. Opnieuw proberen start een nieuwe crawl en kost Firecrawl-tegoed.`
            : 'Website-crawls van alle klanten. Opnieuw proberen start een nieuwe crawl en kost Firecrawl-tegoed.'
        }
        actions={
          orgFilter ? (
            <span className="v1-adm-inline">
              <Link href={`/v1/admin/organizations/${orgFilter}`} className="v1-section-link">
                Naar de klant
              </Link>
              <Link href="/v1/admin/jobs" className="v1-section-link">
                Alle klanten
              </Link>
            </span>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="v1-alert v1-alert--error">
          Kon de crawls niet laden: {error.message}
        </p>
      ) : null}
      <JobsClient rows={rows} />
    </div>
  );
}
