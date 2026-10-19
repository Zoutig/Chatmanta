// V1 klant: Kennisbank-Quiz pagina. Port van app/klantendashboard/quiz/page.tsx.
// Auth via getSessionOrg() + requireOrgMember(); org nooit uit client-input.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { getActiveQuizForOrg, listAnswers, listQuestions } from '@/lib/v1/quiz/data';
import { answersMissingIngest } from '@/lib/v1/quiz/answer-ingest';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { EmptyState } from '@/app/v1/_ui/feedback';
import { QuizRunner } from './quiz-runner';
import { QuizIngestRetry } from './ingest-retry';
import './quiz.css';

export const metadata = { title: 'Kennisquiz · ChatManta' };
export const dynamic = 'force-dynamic';

const KENNISBANK = '/v1/app/kennisbank';

/** Ingevulde antwoorden zonder KB-document (ingest mislukt), alleen op actieve vragen
 *  (een ingetrokken vraag leest de retry ook niet meer in). Antwoorden van de laatste
 *  minuten tellen nog niet mee: die kunnen nog bezig zijn. */
function countNotIngested(
  answers: (Parameters<typeof answersMissingIngest>[0][number] & { questionId: string })[],
  activeQuestionIds: Set<string>,
): number {
  return answersMissingIngest(
    answers.filter((a) => activeQuestionIds.has(a.questionId)),
    Date.now(),
  ).length;
}

export default async function V1QuizPage() {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
    await requireOrgMember(orgId);
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') redirect('/v1/login');
    throw e;
  }

  const sb = getV1ServiceRoleClient();
  const quiz = await getActiveQuizForOrg(sb, orgId);

  // 'voltooid' toont de afgeronde staat (met de inlees-status); vroeger viel een net
  // afgeronde quiz hier terug op "geen quiz klaar".
  if (!quiz || (quiz.status !== 'actief' && quiz.status !== 'voltooid')) {
    return (
      <div className="v1-page v1-qz-page">
        <PageHeader title="Kennisquiz" />
        <div className="v1-card">
          <EmptyState
            action={
              <Link href={KENNISBANK} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                Naar kennisbank
              </Link>
            }
          >
            Er staat nu geen quiz klaar. Zodra er een is, zie je die hier.
          </EmptyState>
        </div>
      </div>
    );
  }

  const [questions, answers] = await Promise.all([
    listQuestions(sb, quiz.id, { activeOnly: true }),
    listAnswers(sb, quiz.id),
  ]);

  const answeredIds = new Set(answers.map((a) => a.questionId));
  const unanswered = quiz.status === 'voltooid' ? [] : questions.filter((q) => !answeredIds.has(q.id));
  const notIngested = countNotIngested(answers, new Set(questions.map((q) => q.id)));
  const retryBlock = notIngested > 0 ? <QuizIngestRetry count={notIngested} /> : null;

  // Voltooide quiz (alle vragen beantwoord/overgeslagen).
  if (unanswered.length === 0) {
    const answeredCount = answers.filter((a) => a.antwoord !== null).length;
    const skippedCount = answers.filter((a) => a.antwoord === null).length;
    return (
      <div className="v1-page v1-qz-page">
        <PageHeader title="Kennisquiz" />
        {retryBlock}
        <div className="v1-card">
          <EmptyState
            action={
              <Link href={KENNISBANK} className={buttonClass({ variant: 'primary', size: 'sm' })}>
                Terug naar kennisbank
              </Link>
            }
          >
            <strong>Quiz afgerond.</strong> We hebben {answeredCount}{' '}
            {answeredCount === 1 ? 'antwoord' : 'antwoorden'} opgeslagen
            {skippedCount > 0 ? ` (${skippedCount} overgeslagen)` : ''}.{' '}
            {notIngested > 0
              ? 'Een deel staat nog niet in je kennisbank, zie hierboven.'
              : answeredCount > 0
                ? 'Je chatbot gebruikt ze vanaf nu in zijn antwoorden.'
                : null}
          </EmptyState>
        </div>
      </div>
    );
  }

  const current = unanswered[0];
  const index = questions.indexOf(current); // positie in de volledige rij (stabiele voortgang)
  const total = questions.length;

  return (
    <div className="v1-page v1-qz-page">
      <PageHeader title="Kennisquiz" description="Een paar korte vragen, je antwoorden gaan direct naar je kennisbank." />
      {retryBlock}
      <QuizRunner question={current} index={index} total={total} />
    </div>
  );
}
