// Klant-quiz-pagina (M4). Org uit de cookie. Toont de eerstvolgende
// onbeantwoorde vraag (resume-cursor), of de bedankmelding als de quiz klaar is.
// Eenmalig per org: een voltooide quiz toont alleen de bedankmelding.

import Link from 'next/link';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getActiveQuizForOrg, listAnswers, listQuestions } from '@/lib/controlroom/server/quiz';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { QuizRunner } from './components/quiz-runner';

export const dynamic = 'force-dynamic';

function BackLink() {
  return (
    <Link href="/klantendashboard" className="klant-btn" data-variant="ghost" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
      ← Terug naar het portaal
    </Link>
  );
}

export default async function KlantQuizPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const quiz = await getActiveQuizForOrg(activeOrg.id);

  // Geen actieve/voltooide quiz → niets te doen.
  if (!quiz || (quiz.status !== 'actief' && quiz.status !== 'voltooid')) {
    return (
      <>
        <PageHead eyebrow="Kennisbank" title="Quiz" />
        <Card>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--klant-muted)' }}>
            Er staat momenteel geen quiz voor je klaar.
          </p>
          <div style={{ marginTop: 12 }}><BackLink /></div>
        </Card>
      </>
    );
  }

  const active = await listQuestions(quiz.id, { activeOnly: true });
  const answers = await listAnswers(quiz.id);
  const answeredIds = new Set(answers.map((a) => a.questionId));
  const remaining = active.filter((q) => !answeredIds.has(q.id));

  // Klaar (voltooid of alles beantwoord/overgeslagen) → bedankmelding.
  if (quiz.status === 'voltooid' || remaining.length === 0) {
    return (
      <>
        <PageHead eyebrow="Kennisbank" title="Quiz voltooid" />
        <Card style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Bedankt! 🎉</div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--klant-muted)' }}>
            Je antwoorden zijn toegevoegd aan je kennisbank. Je chatbot is nu nog beter voorbereid
            op vragen van je bezoekers.
          </p>
          <BackLink />
        </Card>
      </>
    );
  }

  const current = remaining[0];
  const index = active.length - remaining.length; // aantal reeds afgehandeld

  return (
    <>
      <PageHead eyebrow="Kennisbank" title="Verbeter je chatbot" />
      <QuizRunner question={current} index={index} total={active.length} />
    </>
  );
}
