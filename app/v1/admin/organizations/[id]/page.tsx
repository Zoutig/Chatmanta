// V1 admin — klant deep-dive (tabbed).
//
// Rebuildet van de platte sectie-layout naar een ?tab=-navigatie met acht tabs:
//   Overzicht · Notities · Onboarding · Privacy & Data · Gesprekken · Bronnen ·
//   Usage · Beheer
//
// Beheer-tab bewaart de bestaande budget-editor, delete-org-form en export-link
// (actions.ts + export/route.ts zijn ongewijzigd). Alle admin-overlay-logica
// (profiel, notities, onboarding, privacy) is nieuw via lib/v1/admin/overlay-actions.ts.
//
// Auth: getJorionAdminClient() gate't intern via requireJorionAdmin(). De page-RSC
// vangt AUTH_FORBIDDEN op voor defense-in-depth (layout-gate is niet genoeg).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { getProfile } from '@/lib/v1/admin/profile';
import { resolveDailyBudgetEur } from '@/lib/v1/limits/usage-limits';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { TabsNav, type TabDef } from '@/app/klantendashboard/components/tabs';
import { CommercialBadge, TechnicalBadge } from '@/app/admindashboard/components/badges';
import { OverzichtTab } from './_tabs/overzicht-tab';
import { NotitiesTab } from './_tabs/notities-tab';
import { OnboardingTab } from './_tabs/onboarding-tab';
import { PrivacyTab } from './_tabs/privacy-tab';
import { BeheerTab } from './_tabs/beheer-tab';
import { GesprekkenTab } from './_tabs/gesprekken-tab';
import { BronnenTab } from './_tabs/bronnen-tab';
import { UsageTab } from './_tabs/usage-tab';

export const dynamic = 'force-dynamic';

const TABS: TabDef[] = [
  { key: 'overzicht',  label: 'Overzicht' },
  { key: 'notities',   label: 'Notities' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'privacy',    label: 'Privacy & Data' },
  { key: 'gesprekken', label: 'Gesprekken' },
  { key: 'bronnen',    label: 'Bronnen' },
  { key: 'usage',      label: 'Usage' },
  { key: 'beheer',     label: 'Beheer' },
];

const labelStyle = { fontSize: 11, color: 'var(--klant-dim)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' };

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 13.5, marginTop: 3, color: 'var(--klant-ink)' }}>{children}</div>
    </div>
  );
}

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  daily_budget_eur: number | string | null;
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
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }

  const { data: orgData } = await admin
    .from('organizations')
    .select('id, name, slug, created_at, daily_budget_eur, organization_members(count)')
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

  const [profile, sp] = await Promise.all([
    getProfile(admin, id),
    searchParams,
  ]);

  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : 'overzicht';
  const basePath = `/v1/admin/organizations/${id}`;

  return (
    <>
      <PageHead
        eyebrow={<Link href="/v1/admin/organizations">← Organisaties</Link>}
        title={org.name}
        subtitle={`slug: ${org.slug}`}
        actions={
          <>
            <CommercialBadge status={profile.commercialStatus} />
            {profile.technicalStatusOverride && (
              <TechnicalBadge status={profile.technicalStatusOverride} />
            )}
          </>
        }
      />

      {/* Info-strip: vaste velden die altijd zichtbaar zijn */}
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <InfoItem label="Customer owner">{profile.customerOwner}</InfoItem>
          <InfoItem label="Technical owner">{profile.technicalOwner}</InfoItem>
          <InfoItem label="Contact">{profile.contactName ?? '—'}</InfoItem>
          <InfoItem label="Leden">{org.organization_members?.[0]?.count ?? 0}</InfoItem>
          <InfoItem label="Dagbudget">
            {resolveDailyBudgetEur(org.daily_budget_eur) === 0
              ? 'uit'
              : `€${resolveDailyBudgetEur(org.daily_budget_eur).toFixed(2)}`}
          </InfoItem>
          {profile.nextAction && (
            <InfoItem label="Volgende actie">
              {profile.nextAction}
              {profile.nextActionDueDate ? ` (${profile.nextActionDueDate})` : ''}
            </InfoItem>
          )}
        </div>
      </Card>

      <TabsNav tabs={TABS} active={tab} basePath={basePath} />

      {tab === 'overzicht'  && <OverzichtTab orgId={id} profile={profile} />}
      {tab === 'notities'   && <NotitiesTab orgId={id} notes={profile.notes} />}
      {tab === 'onboarding' && <OnboardingTab orgId={id} />}
      {tab === 'privacy'    && <PrivacyTab orgId={id} />}
      {tab === 'gesprekken' && <GesprekkenTab orgId={id} />}
      {tab === 'bronnen'    && <BronnenTab orgId={id} chatbotId={chatbotId} />}
      {tab === 'usage'      && <UsageTab orgId={id} />}
      {tab === 'beheer'     && (
        <BeheerTab orgId={id} slug={org.slug} dailyBudgetRaw={org.daily_budget_eur} />
      )}
    </>
  );
}
