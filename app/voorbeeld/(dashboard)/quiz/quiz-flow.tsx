'use client';

// Voorbeeld: kiest net als de V1-server-pagina de eerste onbeantwoorde vraag of de
// afgeronde staat, maar dan op basis van de voortgang in de browser.

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import type { QuizQuestion } from '@/lib/controlroom/types';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { EmptyState } from '@/app/v1/_ui/feedback';
import { QuizRunner } from './quiz-runner';
import { getQuizProgress, getServerQuizProgress, subscribeQuizProgress } from './quiz-progress';

const KENNISBANK = '/voorbeeld/kennisbank';

export function QuizFlow({ questions }: { questions: QuizQuestion[] }) {
  const progress = useSyncExternalStore(subscribeQuizProgress, getQuizProgress, getServerQuizProgress);
  const unanswered = questions.filter((q) => !(q.id in progress));

  if (unanswered.length === 0) {
    const answers = Object.values(progress);
    const answeredCount = answers.filter((a) => a !== null).length;
    const skippedCount = answers.filter((a) => a === null).length;
    return (
      <div className="v1-page v1-qz-page">
        <PageHeader title="Kennisquiz" />
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
            {skippedCount > 0 ? ` (${skippedCount} overgeslagen)` : ''}. Je kennisbank wordt de komende minuten
            bijgewerkt.
          </EmptyState>
        </div>
      </div>
    );
  }

  const current = unanswered[0];
  const index = questions.indexOf(current);

  return (
    <div className="v1-page v1-qz-page">
      <PageHeader title="Kennisquiz" description="Een paar korte vragen, je antwoorden gaan direct naar je kennisbank." />
      <QuizRunner key={current.id} question={current} index={index} total={questions.length} />
    </div>
  );
}
