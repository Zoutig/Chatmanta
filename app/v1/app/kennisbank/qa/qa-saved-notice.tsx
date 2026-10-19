'use client';

// Bevestiging na het opslaan van een Q&A: wat er nu gebeurt + een weg naar de
// bestaande testchat (Bekijk chatbot). Bewust een link en geen automatische test:
// elke testvraag is een echte (billable) chatbot-call die meetelt voor de limieten.
// Gebruikt door Kennisbank › Q&A, Gesprekken › Meest gesteld en › Wist je chatbot niet.

import Link from 'next/link';
import { AttentionBlock } from '@/app/v1/_ui/feedback';
import { Button, buttonClass } from '@/app/v1/_ui/button';

export const PREVIEW_HREF = '/v1/app/preview';

export function QASavedNotice({
  question,
  notIngested = false,
  onClose,
}: {
  question: string;
  /** true = opgeslagen, maar de chatbot kon het (nog) niet verwerken. */
  notIngested?: boolean;
  onClose: () => void;
}) {
  if (notIngested) {
    return (
      <AttentionBlock
        level="attention"
        title="Opgeslagen, maar je chatbot kent dit antwoord nog niet"
        actions={
          <Button variant="ghost" size="sm" onClick={onClose}>
            Sluiten
          </Button>
        }
      >
        Het verwerken lukte nu niet. Bij de Q&amp;A staat &quot;Nog niet in je chatbot&quot;; probeer het daar zo opnieuw.
      </AttentionBlock>
    );
  }
  return (
    <AttentionBlock
      level="info"
      title="Opgeslagen. Je chatbot gebruikt dit antwoord vanaf nu"
      actions={
        <>
          <Link href={PREVIEW_HREF} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Test je chatbot
          </Link>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Sluiten
          </Button>
        </>
      }
    >
      Bij &quot;{question.length > 90 ? `${question.slice(0, 90)}…` : question}&quot; en vergelijkbare vragen haalt je
      chatbot het antwoord nu hieruit. Hij zet het in zijn eigen woorden. Stel de vraag zelf in de testchat om het te
      controleren.
    </AttentionBlock>
  );
}
