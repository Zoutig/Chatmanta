'use client';

// "Hier wist je chatbot het niet" in het voorbeeld: de voorbeeldvragen plus,
// bovenaan, de vragen waarop de chatbot op de voorbeeldwebsite het antwoord
// schuldig bleef aan déze bezoeker (uit zijn eigen browser, niet van anderen).
// "Antwoord geven" → Kennisbank-Q&A; daarna weet de voorbeeldbot het echt.

import Link from 'next/link';
import { buttonClass } from '@/app/v1/_ui/button';
import { Badge, EmptyState } from '@/app/v1/_ui/feedback';
import { List, ListRow } from '@/app/v1/_ui/list';
import { useDemoConversations, useDemoQA } from '@/lib/voorbeeld/demo-store';
import { normQuestion, ownUnanswered, solvedByOwnQA } from '@/lib/voorbeeld/own-activity';

const QA_HREF = '/voorbeeld/kennisbank?tab=qa&prefillQuestion=';
const MAX_ROWS = 5;

export type FixtureUnansweredRow = { question: string; meta: string };

function whenLabel(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return 'zojuist';
  if (mins < 60) return `${mins} min geleden`;
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  });
}

function AnswerLink({ question }: { question: string }) {
  return (
    <Link href={`${QA_HREF}${encodeURIComponent(question)}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
      Antwoord geven
    </Link>
  );
}

export function UnansweredList({ fixtureRows }: { fixtureRows: FixtureUnansweredRow[] }) {
  const qa = useDemoQA();
  const own = ownUnanswered(useDemoConversations(), qa).slice(0, MAX_ROWS);
  // Een voorbeeldvraag die de bezoeker zelf stelde (staat al bovenaan) of al
  // beantwoordde met een eigen Q&A, verdwijnt uit het voorbeeld-deel.
  const hidden = solvedByOwnQA(qa);
  for (const u of own) hidden.add(normQuestion(u.question));
  const fixtures = fixtureRows
    .filter((u) => !hidden.has(normQuestion(u.question)))
    .slice(0, Math.max(0, MAX_ROWS - own.length));

  if (own.length === 0 && fixtures.length === 0) {
    return <EmptyState>Alles beantwoord. Wat je chatbot niet weet, verschijnt hier.</EmptyState>;
  }
  return (
    <List label="Onbeantwoorde vragen">
      {own.map((u) => (
        <ListRow
          key={`own-${u.question}`}
          wrap
          title={u.question}
          meta={
            <>
              <Badge tone="accent">Jij</Badge>{' '}
              {[u.count > 1 ? `${u.count} keer gevraagd` : 'Jouw vraag op de voorbeeldsite', whenLabel(u.lastAt)].join(' · ')}
            </>
          }
          end={<AnswerLink question={u.question} />}
        />
      ))}
      {fixtures.map((u) => (
        <ListRow key={u.question} wrap title={u.question} meta={u.meta} end={<AnswerLink question={u.question} />} />
      ))}
    </List>
  );
}
