'use client';

// Afhandel-acties onder een gesprek. Bij een onbeantwoord gesprek staat
// "Antwoord geven" al bovenaan (ConversationView); hier alleen "Markeer als
// opgelost". Bij een beantwoord gesprek kun je de vraag alsnog als Q&A vastleggen.
// Resultaat van afhandelen via Toast (spec bijlage A: afhandel-fout = Toast).

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button, buttonClass } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { markConversationResolvedAction } from '../actions';
import { qaHref } from './format';

export function ConversationActions({
  threadId,
  suggestedQuestion,
  isUnanswered,
}: {
  threadId: string;
  suggestedQuestion: string;
  isUnanswered: boolean;
}) {
  const toast = useToast();
  const [resolved, setResolved] = useState(false);
  const [pending, startResolve] = useTransition();

  function handleResolve() {
    startResolve(async () => {
      const res = await markConversationResolvedAction(threadId);
      if (res.ok) {
        setResolved(true);
        toast.success('Gesprek gemarkeerd als opgelost');
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

  if (!suggestedQuestion) return null;
  return (
    <div className="v1-toolbar">
      <Link href={qaHref(suggestedQuestion)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
        Maak Q&amp;A van deze vraag
      </Link>
    </div>
  );
}
