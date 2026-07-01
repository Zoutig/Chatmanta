// V1 Admin — per-org quiz authoring. Leest quiz + vragen via de admin-client;
// auth via getJorionAdminClient() (requireJorionAdmin intern).
// maxDuration=120: de genereer-actie draait analyse synchroon (~15-60s).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { getActiveQuizForOrg, listQuestions } from '@/lib/v1/quiz/data';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
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
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
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
    <>
      <PageHead
        eyebrow={`Admin · ${(org as { name: string }).name}`}
        title="Kennisbank-Quiz"
        actions={
          <Link href="/v1/admin/quiz" className="klant-btn" data-variant="ghost">
            ← Alle quizzen
          </Link>
        }
      />
      <QuizManager
        orgId={orgId}
        quiz={quiz}
        questions={questions}
      />
    </>
  );
}
