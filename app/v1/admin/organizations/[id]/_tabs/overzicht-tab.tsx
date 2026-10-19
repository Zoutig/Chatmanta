// V1 admin klant deep-dive — Overzicht tab (server RSC).
// Toont: profiel-editor + snelle stats (threads deze maand, kosten, bronnen) +
// status-badges. Data worden hier gefetcht; het profiel komt als prop van page.tsx.

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { ONBOARDING_PHASE_LABELS, type AdminOrgProfile } from '@/lib/controlroom/types';
import { Panel, Rows, Row } from '@/app/v1/_ui/panel';
import { Metric, MetricGrid } from '@/app/v1/admin/_ui/metric';
import { CommercialBadge, TechnicalBadge } from '@/app/v1/admin/_ui/status-badges';
import { formatDate, formatEur } from '@/app/v1/admin/_ui/format';
import { ProfileEditor } from '../_components/profile-editor';
import Link from 'next/link';
import { listErrorGroups } from '@/lib/v1/admin/errors';
import { formatRelativeNL } from '@/lib/controlroom/format';
import { Badge } from '@/app/v1/_ui/feedback';

type Props = { orgId: string; profile: AdminOrgProfile };

export async function OverzichtTab({ orgId, profile }: Props) {
  const admin = await getJorionAdminClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Stats parallel: threads-count, kosten, bronnen-count.
  const [threadsRes, costRes, sourcesRes, issues] = await Promise.all([
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
    listErrorGroups({ orgId }).catch(() => []),
  ]);

  const threadsThisMonth = threadsRes.count ?? 0;
  const monthCostEur = ((costRes.data ?? []) as Array<{ cost_eur: number | null }>)
    .reduce((acc, r) => acc + (r.cost_eur ?? 0), 0);
  const sourceCount = sourcesRes.count ?? 0;

  return (
    <div className="v1-stack">
      {/* Snelle stats */}
      <MetricGrid>
        <Metric label="Gesprekken deze maand" value={threadsThisMonth} />
        <Metric label="Kosten deze maand" value={formatEur(monthCostEur)} sub="Geschat" />
        <Metric label="Actieve kennisbronnen" value={sourceCount} />
      </MetricGrid>

      {/* Status */}
      <Panel title="Status">
        <Rows>
          <Row label="Commercieel">
            <CommercialBadge status={profile.commercialStatus} />
          </Row>
          <Row label="Technisch">
            {profile.technicalStatusOverride ? (
              <TechnicalBadge status={profile.technicalStatusOverride} />
            ) : (
              'Afgeleid'
            )}
          </Row>
          <Row label="Onboarding-fase">{ONBOARDING_PHASE_LABELS[profile.onboardingPhase]}</Row>
          <Row label="Klanteigenaar">{profile.customerOwner}</Row>
          <Row label="Technisch eigenaar">{profile.technicalOwner}</Row>
          {profile.nextAction && (
            <Row label="Volgende actie">
              {profile.nextAction}
              {profile.nextActionDueDate ? ` (${formatDate(profile.nextActionDueDate)})` : ''}
            </Row>
          )}
        </Rows>
      </Panel>

      {/* Open fouten van deze klant (Issues, org-gefilterd) */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Open fouten</h2>
          <Link href={`/v1/admin/issues?org=${orgId}`} className="v1-section-link">
            Alle fouten van deze klant
          </Link>
        </div>
        {issues.length === 0 ? (
          <p className="v1-adm-muted" style={{ margin: 0 }}>
            Geen open fouten of waarschuwingen.
          </p>
        ) : (
          <ul className="v1-list">
            {issues.slice(0, 5).map((g) => (
              <li key={g.id}>
                <Link href={`/v1/admin/issues/${g.id}`} className="v1-list-row v1-list-row--link">
                  <Badge tone={g.severity === 'error' ? 'danger' : 'warn'} dot>
                    {g.severity === 'error' ? 'Fout' : 'Waarschuwing'}
                  </Badge>
                  <span className="v1-list-main">
                    <span className="v1-list-title">{g.title}</span>
                    <span className="v1-list-meta">{g.code}</span>
                  </span>
                  <span className="v1-list-meta">
                    {g.count}×, {formatRelativeNL(g.lastSeenAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Profiel bewerken */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Klantbeheer</h2>
        </div>
        <ProfileEditor orgId={orgId} profile={profile} />
      </section>
    </div>
  );
}
