// V0 Klantendashboard — Scherm 7: Account.
//
// Basis-info uit KNOWN_ORGS + mock profile-data + echte usage uit query_log.
// Billing/abonnementen is bewust niet gebouwd in v0 (zie prompt §18). Wel
// een placeholder zodat de UX-flow zichtbaar is.

import { Building2, ShieldCheck, Database, MessagesSquare } from 'lucide-react';
import { getActiveOrgFromCookies, KNOWN_ORGS } from '@/lib/v0/server/active-org';
import { getOverviewMetrics } from '@/lib/v0/klantendashboard/server/metrics';
import { getMockAccountInfo } from '@/lib/v0/klantendashboard/mock/account';
import { getAccountOverrides } from '@/lib/v0/klantendashboard/server/settings';
import type { AccountPlan } from '@/lib/v0/klantendashboard/types';
import { PageHead } from '../components/ui/page-head';
import { AccountEditForm } from './components/account-edit-form';

export const dynamic = 'force-dynamic';

const PLAN_LABEL: Record<AccountPlan, { label: string; tone: 'neutral' | 'accent' | 'success' }> = {
  test: { label: 'Test', tone: 'neutral' },
  starter: { label: 'Starter', tone: 'accent' },
  pro: { label: 'Pro', tone: 'success' },
};

export default async function AccountPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const metrics = await getOverviewMetrics(activeOrg.slug);
  const account = getMockAccountInfo(activeOrg.slug, {
    conversationsThisMonth: metrics.conversationsThisMonth.threads,
    documentsCount: metrics.sources.documents,
  });
  const overrides = await getAccountOverrides(activeOrg.slug);

  const orgName = KNOWN_ORGS[activeOrg.slug].name;
  // Override wint over de mock-/KNOWN_ORGS-waarde (Niels item 8).
  const effective = {
    companyName: overrides.companyName ?? orgName,
    contactPerson: overrides.contactPerson ?? account.contactPerson,
    email: overrides.email ?? account.email,
  };
  const plan = PLAN_LABEL[account.plan];

  return (
    <>
      <PageHead
        eyebrow="Account"
        title="Jouw account en workspace"
        subtitle="Basisgegevens van je workspace, je abonnement en je gebruik."
      />

      <div
        className="klant-stack-narrow"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 20,
        }}
      >
        {/* Linker kolom: bedrijfs- en contactgegevens */}
        <section className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 className="klant-section-title">Bedrijf</h3>

          <AccountEditForm
            initial={{
              companyName: effective.companyName,
              contactPerson: effective.contactPerson,
              email: effective.email,
            }}
          />

          <Row
            icon={Building2}
            label="Website"
            value={
              <a
                href={account.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--klant-accent)', textDecoration: 'none' }}
              >
                {account.websiteUrl}
              </a>
            }
          />
          <Row
            icon={ShieldCheck}
            label="Workspace-ID"
            value={
              <code
                style={{
                  fontSize: 12,
                  background: 'var(--klant-surface)',
                  padding: '2px 8px',
                  borderRadius: 'var(--klant-r-sm)',
                  fontFamily: 'var(--font-mono), monospace',
                  color: 'var(--klant-fg-muted)',
                }}
              >
                {account.workspaceId}
              </code>
            }
          />
        </section>

        {/* Rechter kolom: abonnement + usage */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 className="klant-section-title">Abonnement</h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                background: 'var(--klant-surface)',
                borderRadius: 'var(--klant-r-md)',
              }}
            >
              <span
                className="klant-status"
                data-tone={plan.tone}
                style={{ fontSize: 13, padding: '4px 12px' }}
              >
                {plan.label}
              </span>
              <span style={{ fontSize: 13, color: 'var(--klant-fg-muted)' }}>
                Huidig abonnement
              </span>
            </div>
            <p
              style={{
                fontSize: 12,
                color: 'var(--klant-fg-dim)',
                margin: '8px 0 0',
                lineHeight: 1.5,
              }}
            >
              Abonnementen en facturatie komen later beschikbaar. Voor wijzigingen mail je
              voorlopig naar{' '}
              <a
                href="mailto:contact@chatmanta.nl"
                style={{ color: 'var(--klant-accent)', textDecoration: 'none' }}
              >
                contact@chatmanta.nl
              </a>
              .
            </p>
          </section>

          <section className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 className="klant-section-title">Verbruik</h3>
            <UsageCell
              icon={MessagesSquare}
              label="Gesprekken deze maand"
              value={account.usage.conversationsThisMonth}
            />
            <UsageCell
              icon={Database}
              label="Documenten in kennisbank"
              value={account.usage.documentsCount}
            />
          </section>
        </aside>
      </div>
    </>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '8px 0',
        borderBottom: '1px solid var(--klant-border)',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 'var(--klant-r-md)',
          background: 'var(--klant-surface)',
          color: 'var(--klant-fg-muted)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={15} strokeWidth={1.7} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--klant-fg-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 14, color: 'var(--klant-fg)' }}>{value}</div>
      </div>
    </div>
  );
}

function UsageCell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--klant-r-md)',
          background: 'var(--klant-accent-soft)',
          color: 'var(--klant-accent)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={16} strokeWidth={1.7} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--klant-fg-muted)' }}>{label}</div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--klant-fg)',
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
