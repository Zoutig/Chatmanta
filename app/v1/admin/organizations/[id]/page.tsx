// V1 admin — klant deep-dive (tabbed).
//
// ?tab=-navigatie met tien tabs:
//   Overzicht · Notities · Onboarding · Privacy en data · Gesprekken · Bronnen ·
//   Botinstellingen · Widget · Gebruik · Beheer
//
// Beheer-tab bewaart de bestaande budget-editor, delete-org-form en export-link
// (actions.ts + export/route.ts zijn ongewijzigd). Alle admin-overlay-logica
// (profiel, notities, onboarding, privacy) loopt via overlay-actions.ts.
//
// Auth: getJorionAdminClient() gate't intern via requireJorionAdmin(). De page-RSC
// vangt AUTH_FORBIDDEN op voor defense-in-depth (layout-gate is niet genoeg).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { getProfile } from '@/lib/v1/admin/profile';
import {
  DEFAULT_DAILY_QUESTION_LIMIT,
  DEFAULT_MONTHLY_QUESTION_LIMIT,
  resolveDailyBudgetEur,
  resolveQuestionLimit,
} from '@/lib/v1/limits/usage-limits';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Panel, Rows, Row, EmptyValue } from '@/app/v1/_ui/panel';
import { LinkTabs } from '@/app/v1/_ui/tabs';
import { CommercialBadge, TechnicalBadge } from '@/app/v1/admin/_ui/status-badges';
import { formatDate, formatEur } from '@/app/v1/admin/_ui/format';
import { OverzichtTab } from './_tabs/overzicht-tab';
import { NotitiesTab } from './_tabs/notities-tab';
import { OnboardingTab } from './_tabs/onboarding-tab';
import { PrivacyTab } from './_tabs/privacy-tab';
import { BeheerTab } from './_tabs/beheer-tab';
import { GesprekkenTab } from './_tabs/gesprekken-tab';
import { BronnenTab } from './_tabs/bronnen-tab';
import { InstellingenTab } from './_tabs/instellingen-tab';
import { WidgetTab } from './_tabs/widget-tab';
import { UsageTab } from './_tabs/usage-tab';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'overzicht', label: 'Overzicht' },
  { key: 'notities', label: 'Notities' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'privacy', label: 'Privacy en data' },
  { key: 'gesprekken', label: 'Gesprekken' },
  { key: 'bronnen', label: 'Bronnen' },
  { key: 'instellingen', label: 'Botinstellingen' },
  { key: 'widget', label: 'Widget' },
  { key: 'usage', label: 'Gebruik' },
  { key: 'beheer', label: 'Beheer' },
] as const;

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  daily_budget_eur: number | string | null;
  daily_question_limit: number | null;
  monthly_question_limit: number | null;
  suspended_at: string | null;
  organization_members: { count: number }[] | null;
};

export default async function OrgDeepDivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;

  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }

  const { data: orgData } = await admin
    .from('organizations')
    .select('id, name, slug, created_at, daily_budget_eur, daily_question_limit, monthly_question_limit, suspended_at, organization_members(count)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!orgData) notFound();
  const org = orgData as OrgRow;

  // Chatbot-id nodig voor Bronnen-tab (knowledge_sources.chatbot_id scope).
  const { data: chatbotData } = await admin
    .from('chatbots')
    .select('id')
    .eq('organization_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const chatbotId = (chatbotData as { id: string } | null)?.id ?? null;

  const [profile, sp] = await Promise.all([getProfile(admin, id), searchParams]);

  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : 'overzicht';
  const basePath = `/v1/admin/organizations/${id}`;
  const limits = {
    dailyQuestions: resolveQuestionLimit(org.daily_question_limit, DEFAULT_DAILY_QUESTION_LIMIT),
    monthlyQuestions: resolveQuestionLimit(org.monthly_question_limit, DEFAULT_MONTHLY_QUESTION_LIMIT),
    dailyBudgetEur: resolveDailyBudgetEur(org.daily_budget_eur),
  };

  return (
    <div className="v1-page">
      <Link href="/v1/admin/organizations" className="v1-section-link">
        Terug naar klanten
      </Link>
      <PageHeader
        title={org.name}
        description={`Slug: ${org.slug}`}
        actions={
          <span className="v1-adm-inline">
            <CommercialBadge status={profile.commercialStatus} />
            {profile.technicalStatusOverride && <TechnicalBadge status={profile.technicalStatusOverride} />}
          </span>
        }
      />

      {/* Info-strip: vaste velden die altijd zichtbaar zijn */}
      <Panel title="Kerngegevens">
        <Rows>
          <Row label="Klanteigenaar">{profile.customerOwner}</Row>
          <Row label="Technisch eigenaar">{profile.technicalOwner}</Row>
          <Row label="Contact">{profile.contactName ?? <EmptyValue>Geen</EmptyValue>}</Row>
          <Row label="Leden">{org.organization_members?.[0]?.count ?? 0}</Row>
          <Row label="Limieten">
            {limits.dailyQuestions} vragen per dag, {limits.monthlyQuestions} per maand (plafond{' '}
            {formatEur(limits.dailyBudgetEur)} per dag)
          </Row>
          {profile.nextAction && (
            <Row label="Volgende actie">
              {profile.nextAction}
              {profile.nextActionDueDate ? ` (${formatDate(profile.nextActionDueDate)})` : ''}
            </Row>
          )}
        </Rows>
      </Panel>

      <LinkTabs
        label="Onderdelen van deze klant"
        active={tab}
        items={TABS.map((t) => ({ id: t.key, label: t.label, href: `${basePath}?tab=${t.key}` }))}
      />

      {tab === 'overzicht' && <OverzichtTab orgId={id} profile={profile} />}
      {tab === 'notities' && <NotitiesTab orgId={id} notes={profile.notes} />}
      {tab === 'onboarding' && <OnboardingTab orgId={id} />}
      {tab === 'privacy' && <PrivacyTab orgId={id} />}
      {tab === 'gesprekken' && <GesprekkenTab orgId={id} />}
      {tab === 'bronnen' && <BronnenTab orgId={id} chatbotId={chatbotId} />}
      {tab === 'instellingen' && <InstellingenTab orgId={id} chatbotId={chatbotId} />}
      {tab === 'widget' && <WidgetTab orgId={id} chatbotId={chatbotId} />}
      {tab === 'usage' && <UsageTab orgId={id} />}
      {tab === 'beheer' && (
        <BeheerTab orgId={id} slug={org.slug} limits={limits} suspendedAt={org.suspended_at} />
      )}
    </div>
  );
}
