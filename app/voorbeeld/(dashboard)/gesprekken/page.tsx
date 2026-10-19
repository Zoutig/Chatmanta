// Voorbeeld-dashboard: Gesprekken. Kopie van app/v1/app/gesprekken/page.tsx met
// vaste voorbeeldgesprekken (lib/voorbeeld/fixtures/gesprekken.ts) in plaats van
// database-reads.
//
// Drie tabs via ?view=: "Alle gesprekken" (lijst), "Wist je chatbot niet" (werklijst,
// zelfde component als V1) en "Meest gestelde vragen".
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
  findFixtureConversationsForQuestions,
  getFixtureFaq,
  getFixtureUnanswered,
  listFixtureConversations,
} from '@/lib/voorbeeld/fixtures/gesprekken';
import { normalizeQuestionKey } from '@/lib/v1/dashboard/unanswered-core';
import { DemoUnansweredTab } from './unanswered-tab';
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
  const view: 'gesprekken' | 'unanswered' | 'top-questions' =
    rawView === 'top-questions' ? 'top-questions' : rawView === 'unanswered' ? 'unanswered' : 'gesprekken';

  const all = listFixtureConversations(period);
  const faqResult = getFixtureFaq();
  const unansweredRows = getFixtureUnanswered().map((u) => ({
    key: normalizeQuestionKey(u.question),
    question: u.question,
    occurrences: u.occurrences,
    lastSeenAt: u.lastSeenAt,
    status: 'open' as const,
    qaExists: false,
    threadIds: findFixtureConversationsForQuestions([u.question]).map((h) => h.threadId),
  }));
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
        unansweredOpenCount={unansweredRows.length}
        unansweredView={view === 'unanswered' ? <DemoUnansweredTab questions={unansweredRows} /> : null}
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
