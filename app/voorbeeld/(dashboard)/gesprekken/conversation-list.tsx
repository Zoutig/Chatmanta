'use client';

// Tabs + filterregel + lijst van Gesprekken in het voorbeeld. Zelfde markup als
// de V1-pagina (app/v1/app/gesprekken/page.tsx), maar client-side, omdat de
// gesprekken die de bezoeker zelf op de voorbeeldwebsite voerde alleen in zijn
// browser staan (demo-opslag). Die komen bovenaan, met een "Jij"-label: vraag
// iets op de site en zie het hier terug.
//
// De voorbeeldgesprekken komen van de server, met de tijd al opgemaakt (zo
// botst de opmaak van server en browser niet bij hydratie).

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { V1ConversationListItem } from '@/lib/v1/dashboard/conversations';
import { useDemoConversations } from '@/lib/voorbeeld/demo-store';
import { periodStart } from '@/lib/voorbeeld/fixtures/gesprekken';
import { LinkTabs } from '@/app/v1/_ui/tabs';
import { List } from '@/app/v1/_ui/list';
import { Badge, EmptyState } from '@/app/v1/_ui/feedback';
import { buttonClass } from '@/app/v1/_ui/button';
import { FilterBar, type Period } from './filter-bar';
import { formatShort } from './_conversation/format';
import { ownToListItem } from './_conversation/own';

const BASE = '/voorbeeld/gesprekken';

export type ListItem = V1ConversationListItem & { when: string; own?: boolean };

/** "Zojuist" voor een gesprek van de laatste paar minuten, anders de korte datum. */
function whenLabel(iso: string): string {
  const age = Date.now() - new Date(iso).getTime();
  return age >= 0 && age < 5 * 60_000 ? 'Zojuist' : formatShort(iso);
}

export function ConversationList({
  view,
  period,
  onlyUnanswered,
  items: fixtureItems,
  fixtureUnansweredCount,
  faqCount,
  topQuestions,
}: {
  view: 'gesprekken' | 'top-questions';
  period: Period;
  onlyUnanswered: boolean;
  /** Voorbeeldgesprekken in de periode, al gefilterd op onbeantwoord als dat aanstaat. */
  items: ListItem[];
  fixtureUnansweredCount: number;
  faqCount: number;
  topQuestions: ReactNode;
}) {
  const own = useDemoConversations();
  const since = periodStart(period).toISOString();
  const ownInPeriod: ListItem[] = own
    .filter((c) => c.turns.length > 0)
    .map(ownToListItem)
    .filter((c) => c.lastMessageAt >= since)
    .map((c) => ({ ...c, when: whenLabel(c.lastMessageAt), own: true }))
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  const ownVisible = onlyUnanswered ? ownInPeriod.filter((c) => c.unanswered) : ownInPeriod;
  const items = [...ownVisible, ...fixtureItems];
  const unansweredCount = fixtureUnansweredCount + ownInPeriod.filter((c) => c.unanswered).length;

  // Tabs houden de filters vast, zodat terugschakelen dezelfde lijst geeft.
  const filterQs = new URLSearchParams({ filter: period });
  if (onlyUnanswered) filterQs.set('unanswered', '1');
  const topQs = new URLSearchParams(filterQs);
  topQs.set('view', 'top-questions');

  return (
    <>
      <LinkTabs
        label="Gesprekken"
        active={view}
        items={[
          { id: 'gesprekken', label: 'Alle gesprekken', count: items.length, href: `${BASE}?${filterQs}` },
          { id: 'top-questions', label: 'Meest gestelde vragen', count: faqCount, href: `${BASE}?${topQs}` },
        ]}
      />

      {view === 'top-questions' ? (
        topQuestions
      ) : (
        <div className="v1-stack">
          <FilterBar period={period} onlyUnanswered={onlyUnanswered} unansweredCount={unansweredCount} exportRows={items} />
          <section className="v1-card v1-gs-listcard" aria-label="Gesprekken">
            {items.length === 0 ? (
              <EmptyLine period={period} onlyUnanswered={onlyUnanswered} />
            ) : (
              <List label="Gesprekken">
                {items.map((c) => (
                  <ConversationRow key={c.id} item={c} />
                ))}
              </List>
            )}
          </section>
        </div>
      )}
    </>
  );
}

/** Rij met Link scroll={false}: het zijpaneel opent zonder dat de lijst verspringt. */
function ConversationRow({ item }: { item: ListItem }) {
  const n = item.messageCount;
  return (
    <li>
      <Link href={`${BASE}/${encodeURIComponent(item.id)}`} scroll={false} className="v1-list-row v1-list-row--link">
        <span className="v1-list-main">
          <span className="v1-list-title">{item.firstQuestion}</span>
          <span className="v1-list-meta">
            {item.own ? 'Jouw gesprek op de voorbeeldsite · ' : ''}
            {n} {n === 1 ? 'bericht' : 'berichten'} · {item.when}
          </span>
        </span>
        {item.own || item.unanswered ? (
          <span className="v1-list-end">
            {item.unanswered ? <Badge tone="warn">Onbeantwoord</Badge> : null}
            {item.own ? <Badge tone="accent">Jij</Badge> : null}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function EmptyLine({ period, onlyUnanswered }: { period: Period; onlyUnanswered: boolean }) {
  if (onlyUnanswered) {
    return <EmptyState>Geen onbeantwoorde vragen in deze periode.</EmptyState>;
  }
  if (period === 'today') return <EmptyState>Vandaag nog geen gesprekken.</EmptyState>;
  if (period === 'last_7_days') return <EmptyState>De afgelopen 7 dagen nog geen gesprekken.</EmptyState>;
  return (
    <EmptyState
      action={
        <Link href="/voorbeeld/widget" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Naar widget
        </Link>
      }
    >
      Nog geen gesprekken. Zodra je widget live staat, zie je ze hier.
    </EmptyState>
  );
}
