// V1 Klantendashboard: Gesprekken (spec 7.3 + bijlage A).
//
// Twee tabs via ?view=: "Alle gesprekken" (lijst) en "Meest gestelde vragen".
// Eén filterregel: periode (?filter=today|last_7_days|last_30_days) plus de
// schakelaar "Alleen onbeantwoord" (?unanswered=1, met teller; vervangt de
// vroegere warn-banner). Een gesprek opent rechts in een Drawer via de
// onderschepte route @drawer/(.)[id]; de rij-links gebruiken scroll={false},
// zodat de lijst na sluiten niet naar boven springt.
//
// Negatieve feedback (banner, filter, badge) is bewust weg: de V1-widget heeft
// sinds PR #262 geen duimpjes meer. ?filter=negative_feedback valt terug op 30 dagen.
//
// Read-only. Auth-keten: getSessionOrg → AUTH_FORBIDDEN / NEXT_REDIRECT.
// Alle reads onder de session-client (RLS).

import Link from 'next/link';
import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { listV1Conversations, type V1ConversationListItem } from '@/lib/v1/dashboard/conversations';
import { getV1KlantFaqForDashboard, getV1FaqConfig } from '@/lib/v1/dashboard/faq';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { LinkTabs } from '@/app/v1/_ui/tabs';
import { List } from '@/app/v1/_ui/list';
import { Badge, EmptyState } from '@/app/v1/_ui/feedback';
import { buttonClass } from '@/app/v1/_ui/button';
import { getOrgChatbot } from '../rag-config';
import { FilterBar, type Period } from './filter-bar';
import { TopQuestionsTab } from './top-questions/top-questions-tab';
import { formatShort } from './_conversation/format';

export const dynamic = 'force-dynamic';

const BASE = '/v1/app/gesprekken';
const PERIODS: Period[] = ['today', 'last_7_days', 'last_30_days'];
const DESCRIPTION = 'Lees mee met je bezoekers en zie waar je chatbot vastloopt.';

export default async function V1GesprekkenPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; view?: string; unanswered?: string }>;
}) {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <div className="v1-page">
          <PageHeader title="Geen toegang" description="Je bent geen lid van deze organisatie." />
        </div>
      );
    }
    throw e; // NEXT_REDIRECT → /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return (
      <div className="v1-page">
        <PageHeader title="Gesprekken" description="Er is nog geen chatbot voor je organisatie ingesteld." />
      </div>
    );
  }

  const { filter: rawFilter, view: rawView, unanswered: rawUnanswered } = await searchParams;
  // Oude deelbare link ?filter=unanswered = 30 dagen + alleen onbeantwoord.
  const legacyUnanswered = rawFilter === 'unanswered';
  const period: Period = PERIODS.includes(rawFilter as Period) ? (rawFilter as Period) : 'last_30_days';
  const onlyUnanswered = legacyUnanswered || rawUnanswered === '1';
  const view: 'gesprekken' | 'top-questions' = rawView === 'top-questions' ? 'top-questions' : 'gesprekken';

  const [all, faqResult, faqConfig, qaData] = await Promise.all([
    listV1Conversations(supabase, orgId, chatbot.id, period),
    getV1KlantFaqForDashboard(supabase, orgId, chatbot.id),
    getV1FaqConfig(supabase, orgId, chatbot.id),
    supabase
      .from('org_qa_items')
      .select('question')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbot.id)
      .eq('active', true),
  ]);

  const existingQAQuestions = (qaData.data ?? []).map((r: { question: string }) => r.question as string);
  const unansweredCount = all.filter((x) => x.unanswered).length;
  const items = onlyUnanswered ? all.filter((x) => x.unanswered) : all;

  // Tabs houden de filters vast, zodat terugschakelen dezelfde lijst geeft.
  const filterQs = new URLSearchParams({ filter: period });
  if (onlyUnanswered) filterQs.set('unanswered', '1');
  const topQs = new URLSearchParams(filterQs);
  topQs.set('view', 'top-questions');

  return (
    <div className="v1-page">
      <PageHeader title="Gesprekken" description={DESCRIPTION} />

      <LinkTabs
        label="Gesprekken"
        active={view}
        items={[
          { id: 'gesprekken', label: 'Alle gesprekken', count: items.length, href: `${BASE}?${filterQs}` },
          {
            id: 'top-questions',
            label: 'Meest gestelde vragen',
            count: faqResult.items.length,
            href: `${BASE}?${topQs}`,
          },
        ]}
      />

      {view === 'top-questions' ? (
        <TopQuestionsTab
          initial={faqResult.items}
          totalUnique={faqResult.totalUnique}
          pending={faqResult.pending}
          generatedAt={faqResult.generatedAt}
          config={faqConfig}
          existingQAQuestions={existingQAQuestions}
        />
      ) : (
        <div className="v1-stack">
          <FilterBar period={period} onlyUnanswered={onlyUnanswered} unansweredCount={unansweredCount} />
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
    </div>
  );
}

/** Rij met Link scroll={false}: het zijpaneel opent zonder dat de lijst verspringt. */
function ConversationRow({ item }: { item: V1ConversationListItem }) {
  const n = item.messageCount;
  return (
    <li>
      <Link href={`${BASE}/${item.id}`} scroll={false} className="v1-list-row v1-list-row--link">
        <span className="v1-list-main">
          <span className="v1-list-title">{item.firstQuestion}</span>
          <span className="v1-list-meta">
            {n} {n === 1 ? 'bericht' : 'berichten'} · {formatShort(item.lastMessageAt)}
          </span>
        </span>
        {item.unanswered ? (
          <span className="v1-list-end">
            <Badge tone="warn">Onbeantwoord</Badge>
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
        <Link href="/v1/app/widget" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Naar widget
        </Link>
      }
    >
      Nog geen gesprekken. Zodra je widget live staat, zie je ze hier.
    </EmptyState>
  );
}
