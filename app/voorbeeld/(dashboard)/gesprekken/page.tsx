// Voorbeeld-dashboard: Gesprekken. Kopie van app/v1/app/gesprekken/page.tsx met
// vaste voorbeeldgesprekken (lib/voorbeeld/fixtures/gesprekken.ts) in plaats van
// database-reads.
//
// Twee tabs via ?view=: "Alle gesprekken" (lijst) en "Meest gestelde vragen".
// Eén filterregel: periode (?filter=today|last_7_days|last_30_days) plus de
// schakelaar "Alleen onbeantwoord" (?unanswered=1, met teller). Een gesprek
// opent rechts in een Drawer via de onderschepte route @drawer/(.)[id].
//
// De lijst zelf is een client component (ConversationList): daar komen de
// gesprekken bij die de bezoeker zelf op de voorbeeldwebsite voerde.

import { PageHeader } from '@/app/v1/_ui/page-header';
import {
  FIXTURE_FAQ_CONFIG,
  FIXTURE_QA_QUESTIONS,
  getFixtureFaq,
  listFixtureConversations,
} from '@/lib/voorbeeld/fixtures/gesprekken';
import type { Period } from './filter-bar';
import { TopQuestionsTab } from './top-questions/top-questions-tab';
import { formatShort } from './_conversation/format';
import { ConversationList, type ListItem } from './conversation-list';

// Tijden zijn relatief aan nu: per request renderen.
export const dynamic = 'force-dynamic';

const PERIODS: Period[] = ['today', 'last_7_days', 'last_30_days'];
const DESCRIPTION = 'Lees mee met je bezoekers en zie waar je chatbot vastloopt.';

export default async function V1GesprekkenPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; view?: string; unanswered?: string }>;
}) {
  const { filter: rawFilter, view: rawView, unanswered: rawUnanswered } = await searchParams;
  // Oude deelbare link ?filter=unanswered = 30 dagen + alleen onbeantwoord.
  const legacyUnanswered = rawFilter === 'unanswered';
  const period: Period = PERIODS.includes(rawFilter as Period) ? (rawFilter as Period) : 'last_30_days';
  const onlyUnanswered = legacyUnanswered || rawUnanswered === '1';
  const view: 'gesprekken' | 'top-questions' = rawView === 'top-questions' ? 'top-questions' : 'gesprekken';

  const all = listFixtureConversations(period);
  const faqResult = getFixtureFaq();
  const unansweredCount = all.filter((x) => x.unanswered).length;
  const items: ListItem[] = (onlyUnanswered ? all.filter((x) => x.unanswered) : all).map((c) => ({
    ...c,
    when: formatShort(c.lastMessageAt),
  }));

  return (
    <div className="v1-page">
      <PageHeader title="Gesprekken" description={DESCRIPTION} />

      <ConversationList
        view={view}
        period={period}
        onlyUnanswered={onlyUnanswered}
        items={items}
        fixtureUnansweredCount={unansweredCount}
        faqCount={faqResult.items.length}
        topQuestions={
          view === 'top-questions' ? (
            <TopQuestionsTab
              initial={faqResult.items}
              totalUnique={faqResult.totalUnique}
              pending={faqResult.pending}
              generatedAt={faqResult.generatedAt}
              config={FIXTURE_FAQ_CONFIG}
              existingQAQuestions={FIXTURE_QA_QUESTIONS}
            />
          ) : null
        }
      />
    </div>
  );
}
