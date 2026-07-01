// V1 klant — Kennisbank-Quiz pagina. Port van app/klantendashboard/quiz/page.tsx.
// Auth via getSessionOrg() + requireOrgMember(); org nooit uit client-input.

import { redirect } from 'next/navigation';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { getActiveQuizForOrg, listAnswers, listQuestions } from '@/lib/v1/quiz/data';
import { QuizRunner } from './quiz-runner';

export const dynamic = 'force-dynamic';

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

  if (!quiz || quiz.status !== 'actief') {
    return (
      <div className="klant-card" style={{ maxWidth: 540 }}>
        <div className="klant-section-title">Kennisbank-Quiz</div>
        <p className="klant-hint" style={{ marginTop: 6 }}>
          Er staat op dit moment geen quiz klaar. Je beheerder activeert er een zodra de analyse van je kennisbank klaar is.
        </p>
      </div>
    );
  }

  const [questions, answers] = await Promise.all([
    listQuestions(sb, quiz.id, { activeOnly: true }),
    listAnswers(sb, quiz.id),
  ]);

  const answeredIds = new Set(answers.map((a) => a.questionId));
  const unanswered = questions.filter((q) => !answeredIds.has(q.id));

  // Voltooide quiz (alle vragen beantwoord/overgeslagen).
  if (unanswered.length === 0) {
    const answeredCount = answers.filter((a) => a.antwoord !== null).length;
    const skippedCount = answers.filter((a) => a.antwoord === null).length;
    return (
      <div className="klant-card" style={{ maxWidth: 540 }}>
        <div className="klant-section-title">Quiz voltooid!</div>
        <p className="klant-hint" style={{ marginTop: 6 }}>
          Bedankt voor je antwoorden. We hebben {answeredCount} {answeredCount === 1 ? 'antwoord' : 'antwoorden'} opgeslagen
          {skippedCount > 0 ? ` (${skippedCount} overgeslagen)` : ''}.
          Je kennisbank wordt de komende minuten bijgewerkt.
        </p>
      </div>
    );
  }

  const current = unanswered[0];
  const index = questions.indexOf(current); // positie in de volledige rij (stabiele voortgang)
  const total = questions.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 className="klant-page-title">Kennisbank-Quiz</h1>
        <p className="klant-page-sub">
          Help je chatbot beter worden door een paar korte vragen te beantwoorden.
          Je antwoorden worden direct aan je kennisbank toegevoegd.
        </p>
      </div>
      <QuizRunner question={current} index={index} total={total} />
    </div>
  );
}
