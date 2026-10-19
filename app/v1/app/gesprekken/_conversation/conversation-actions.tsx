'use client';

// Afhandel-acties onder een gesprek. Bij een onbeantwoord gesprek staat
// "Antwoord geven" al bovenaan (ConversationView); hier alleen "Markeer als
// opgelost". Dat zet threads.status='closed'; de gedeelde "onbeantwoord"-definitie
// (lib/v1/dashboard/unanswered-core.ts) leest die status, dus het gesprek en zijn vraag
// verdwijnen daarna uit de tellers en de werklijst. Bij een beantwoord gesprek kun je
// de vraag alsnog als Q&A vastleggen.
// Resultaat van afhandelen via Toast (spec bijlage A: afhandel-fout = Toast).

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button, buttonClass } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { markConversationResolvedAction } from '../actions';
import { qaHref } from './format';

export function ConversationActions({
  threadId,
  suggestedQuestion,
  isUnanswered,
  isClosed = false,
}: {
  threadId: string;
  suggestedQuestion: string;
  isUnanswered: boolean;
  isClosed?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [resolved, setResolved] = useState(false);
  const [pending, startResolve] = useTransition();

  function handleResolve() {
    startResolve(async () => {
      const res = await markConversationResolvedAction(threadId);
      if (res.ok) {
        setResolved(true);
        toast.success('Gesprek gemarkeerd als opgelost');
        router.refresh(); // tellers en lijst bijwerken
      } else {
        toast.error(res.error ?? 'Er ging iets mis. Probeer het opnieuw.');
      }
    });
  }

  if (isUnanswered) {
    return (
      <div className="v1-toolbar">
        {resolved ? (
          <span className="v1-saved" role="status">
            <Check size={14} strokeWidth={2.2} aria-hidden="true" />
            Opgelost
          </span>
        ) : (
          <Button variant="secondary" size="sm" loading={pending} onClick={handleResolve}>
            Markeer als opgelost
          </Button>
        )}
      </div>
    );
  }

  if (!suggestedQuestion && !isClosed) return null;
  return (
    <div className="v1-toolbar">
      {isClosed ? (
        <span className="v1-saved" role="status">
          <Check size={14} strokeWidth={2.2} aria-hidden="true" />
          Opgelost
        </span>
      ) : null}
      {suggestedQuestion ? (
      <Link href={qaHref(suggestedQuestion)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
        Maak Q&amp;A van deze vraag
      </Link>
      ) : null}
    </div>
  );
}
