// V1 admin — AVG data-portabiliteit (M-E §3a). GET → JSON-download van alle
// org-data. requireJorionAdmin()-gate zit IN getJorionAdminClient() (service-role
// NÁ de admin-rol-check; Jorion is geen org-member → RLS-client zou 0 rijen geven).
//
// Geen PII-redactie: dit is een bewust gegevensverzoek-uitvoer (de admin exporteert
// de eigen-klant-data). Chunk-content blijft weg (afgeleid + te groot); query_log
// wordt gecapt (PostgREST-rij-cap) met een notitie.

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';

export const dynamic = 'force-dynamic';

// PostgREST capt server-side op ~1000 rijen; we pakken de recentste N met een notitie.
const QUERY_LOG_CAP = 1000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let admin;
  try {
    admin = await getJorionAdminClient(); // gate't intern via requireJorionAdmin
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return new Response('Geen toegang (Jorion-admin vereist).', { status: 403 });
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }

  const { data: org } = await admin
    .from('organizations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!org) return new Response('Organisatie niet gevonden.', { status: 404 });
  const slug = (org as { slug: string }).slug;

  const [members, chatbots, sources, documents, jobs, queryLog] = await Promise.all([
    admin.from('organization_members').select('*').eq('organization_id', id),
    admin.from('chatbots').select('*').eq('organization_id', id),
    admin.from('knowledge_sources').select('*').eq('organization_id', id),
    // metadata + included; chunk-content bewust weggelaten (afgeleid + te groot).
    admin
      .from('documents')
      .select('id, chatbot_id, knowledge_source_id, filename, source, status, included, metadata, created_at, deleted_at')
      .eq('organization_id', id),
    admin.from('processing_jobs').select('*').eq('organization_id', id),
    admin
      .from('query_log')
      .select('*')
      .eq('organization_id', id)
      .order('created_at', { ascending: false })
      .limit(QUERY_LOG_CAP),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    organization: org,
    members: members.data ?? [],
    chatbots: chatbots.data ?? [],
    knowledge_sources: sources.data ?? [],
    documents: documents.data ?? [],
    processing_jobs: jobs.data ?? [],
    query_log: queryLog.data ?? [],
    notes: {
      query_log: `Gecapt op de recentste ${QUERY_LOG_CAP} rijen (PostgREST-cap).`,
      document_chunks: 'Chunk-content weggelaten (afgeleide data; document-metadata is opgenomen).',
    },
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="org-${slug}-export.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
