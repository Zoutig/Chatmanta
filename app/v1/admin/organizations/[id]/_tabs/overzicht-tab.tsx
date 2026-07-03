// V1 admin klant deep-dive — Overzicht tab (server RSC).
// Toont: profiel-editor + snelle stats (threads deze maand, kosten, bronnen) +
// status-badges. Data worden hier gefetcht; het profiel komt als prop van page.tsx.

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { MetricCard } from '@/app/admindashboard/components/metric-card';
import { CommercialBadge, TechnicalBadge } from '@/app/admindashboard/components/badges';
import {
  COMMERCIAL_STATUS_LABELS,
  TECHNICAL_STATUS_LABELS,
  ONBOARDING_PHASE_LABELS,
  type AdminOrgProfile,
} from '@/lib/controlroom/types';
import { ProfileEditor } from '../_components/profile-editor';

const labelStyle = { fontSize: 11, color: 'var(--klant-dim)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' };
const valueStyle = { fontSize: 13.5, marginTop: 3, color: 'var(--klant-ink)' };

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{children}</div>
    </div>
  );
}

function fmtEur(n: number) {
  return `€${n.toFixed(n < 1 ? 3 : 2)}`;
}

type Props = { orgId: string; profile: AdminOrgProfile };

export async function OverzichtTab({ orgId, profile }: Props) {
  const admin = await getJorionAdminClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Stats parallel: threads-count, kosten, bronnen-count.
  const [threadsRes, costRes, sourcesRes] = await Promise.all([
    admin
      .from('threads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', monthStart),
    admin
      .from('query_log')
      .select('cost_eur')
      .eq('organization_id', orgId)
      .gte('created_at', monthStart),
    admin
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null),
  ]);

  const threadsThisMonth = threadsRes.count ?? 0;
  const monthCostEur = ((costRes.data ?? []) as Array<{ cost_eur: number | null }>)
    .reduce((acc, r) => acc + (r.cost_eur ?? 0), 0);
  const sourceCount = sourcesRes.count ?? 0;

  const technicalLabel = profile.technicalStatusOverride
    ? TECHNICAL_STATUS_LABELS[profile.technicalStatusOverride]
    : 'Afgeleid';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Snelle stats */}
      <div className="klant-metrics-grid">
        <MetricCard label="Gesprekken (deze maand)" value={threadsThisMonth} />
        <MetricCard label="Kosten (deze maand)" value={fmtEur(monthCostEur)} sub="EUR geschat" />
        <MetricCard label="Actieve kennisbronnen" value={sourceCount} />
      </div>

      {/* Status */}
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--klant-ink)' }}>Status</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <CommercialBadge status={profile.commercialStatus} />
          {profile.technicalStatusOverride && <TechnicalBadge status={profile.technicalStatusOverride} />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <InfoItem label="Commercieel">{COMMERCIAL_STATUS_LABELS[profile.commercialStatus]}</InfoItem>
          <InfoItem label="Technisch">{technicalLabel}</InfoItem>
          <InfoItem label="Onboarding-fase">{ONBOARDING_PHASE_LABELS[profile.onboardingPhase]}</InfoItem>
          <InfoItem label="Customer owner">{profile.customerOwner}</InfoItem>
          <InfoItem label="Technical owner">{profile.technicalOwner}</InfoItem>
          {profile.nextAction && (
            <InfoItem label="Volgende actie">
              {profile.nextAction}
              {profile.nextActionDueDate ? ` (${profile.nextActionDueDate})` : ''}
            </InfoItem>
          )}
        </div>
      </Card>

      {/* Profiel bewerken */}
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--klant-ink)' }}>Klantbeheer</div>
        <ProfileEditor orgId={orgId} profile={profile} />
      </Card>
    </div>
  );
}
