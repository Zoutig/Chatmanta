import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { JobsClient, type JobRow } from './jobs-client';

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

export default async function AdminJobsPage() {
  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
    }
    throw e; // NEXT_REDIRECT → /v1/login
  }

  const { data: jobsData, error } = await admin
    .from('processing_jobs')
    .select('id, organization_id, target_id, status, attempts, error_message, created_at, organizations(name)')
    .eq('job_type', 'crawl_website')
    .order('created_at', { ascending: false })
    .limit(JOB_LIMIT);
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
  const lastEventByJob = new Map<string, string>();
  const { data: events } = await admin
    .from('crawl_events')
    .select('processing_job_id, decision, message, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  for (const ev of (events ?? []) as Array<{ processing_job_id: string | null; decision: string | null; message: string | null }>) {
    if (!ev.processing_job_id || lastEventByJob.has(ev.processing_job_id)) continue;
    lastEventByJob.set(ev.processing_job_id, ev.message ?? ev.decision ?? '');
  }

  const rows: JobRow[] = jobs.map((j) => ({
    jobId: j.id,
    orgName: j.organizations?.name ?? '—',
    host: j.target_id ? hostById.get(j.target_id) ?? null : null,
    status: j.status,
    attempts: j.attempts ?? 0,
    errorMessage: j.error_message,
    createdAt: j.created_at,
    lastEvent: lastEventByJob.get(j.id) ?? null,
  }));

  return (
    <>
      <PageHead
        title="Crawl-jobs"
        subtitle="Cross-org website-crawls. 'Opnieuw proberen' start een verse crawl (Firecrawl-credits)."
      />
      {error && (
        <p role="alert" style={{ color: 'var(--klant-danger)', fontSize: 13 }}>
          Kon de jobs niet laden: {error.message}
        </p>
      )}
      <JobsClient rows={rows} />
    </>
  );
}
