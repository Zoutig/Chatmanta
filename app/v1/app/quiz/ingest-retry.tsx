'use client';

// Melding + knop voor quiz-antwoorden die (nog) niet in de kennisbank staan.
// De server-pagina telt ze (antwoord gevuld, geen gekoppeld document); deze knop
// probeert ze opnieuw in te lezen via retryQuizIngestV1Action (org uit de sessie).

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AttentionBlock } from '@/app/v1/_ui/feedback';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { retryQuizIngestV1Action } from './actions';

export function QuizIngestRetry({ count }: { count: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  function retry() {
    start(async () => {
      const res = await retryQuizIngestV1Action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.failed > 0) {
        toast.error(
          res.retried > 0
            ? `${res.retried} verwerkt, ${res.failed} nog niet. Probeer het later opnieuw.`
            : 'Het lukte nog niet. Probeer het over een paar minuten opnieuw.',
        );
      } else if (res.retried > 0) {
        toast.success(res.retried === 1 ? 'Antwoord staat nu in je kennisbank' : 'Antwoorden staan nu in je kennisbank');
      } else {
        toast.success('Er was niets meer te verwerken');
      }
      router.refresh();
    });
  }

  return (
    <AttentionBlock
      level="attention"
      title={
        count === 1
          ? '1 antwoord staat nog niet in je kennisbank'
          : `${count} antwoorden staan nog niet in je kennisbank`
      }
      actions={
        <Button variant="secondary" size="sm" loading={pending} onClick={retry}>
          Opnieuw proberen
        </Button>
      }
    >
      Je antwoord is bewaard, maar je chatbot kon het nog niet leren. Probeer het opnieuw.
    </AttentionBlock>
  );
}
