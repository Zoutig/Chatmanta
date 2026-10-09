// V1 Admin — per-org quiz authoring. Leest quiz + vragen via de admin-client;
// auth via getJorionAdminClient() (requireJorionAdmin intern).
// maxDuration=120: de genereer-actie draait analyse synchroon (~15-60s).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { getActiveQuizForOrg, listQuestions } from '@/lib/v1/quiz/data';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { QuizManager } from './quiz-manager';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export default async function V1AdminQuizOrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e;
  }

  // Valideer dat de org bestaat (UUID-formaat + DB-aanwezigheid).
  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!org) notFound();

  const quiz = await getActiveQuizForOrg(admin, orgId);
  const questions = quiz ? await listQuestions(admin, quiz.id) : [];

  return (
    <div className="v1-page">
      <Link href="/v1/admin/quiz" className="v1-section-link">
        Terug naar alle quizzen
      </Link>
      <PageHeader
        title="Kennisbank-Quiz"
        description={`Quiz voor ${(org as { name: string }).name}. Jij keurt de vragen goed voordat de klant ze ziet.`}
      />
      <QuizManager orgId={orgId} quiz={quiz} questions={questions} />
    </div>
  );
}
