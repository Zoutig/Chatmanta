// V1 admin — Beheer tab (server RSC).
// Wraps de bestaande BudgetEditor + DeleteOrgForm + export-link uit [id]/ en voegt
// ledenbeheer toe (uitnodigen / invite opnieuw / verwijderen — MembersManager).

import { resolveDailyBudgetEur } from '@/lib/v1/limits/usage-limits';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { listOrgMembers } from '@/lib/v1/admin/members';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill } from '@/app/klantendashboard/components/ui/pill';
import { BudgetEditor } from '../budget-editor';
import { DeleteOrgForm } from '../delete-org-form';
import { MembersManager } from '../members-manager';
import { SuspendOrgForm } from '../suspend-org-form';

const labelStyle = { fontSize: 12, color: 'var(--klant-muted)' } as const;
const sectionTitle = { fontSize: 14, fontWeight: 600, margin: '0 0 8px', color: 'var(--klant-ink)' } as const;

type Props = {
  orgId: string;
  slug: string;
  dailyBudgetRaw: number | string | null;
  suspendedAt: string | null;
};

export async function BeheerTab({ orgId, slug, dailyBudgetRaw, suspendedAt }: Props) {
  const capEur = resolveDailyBudgetEur(dailyBudgetRaw);
  const suspended = Boolean(suspendedAt);
  const admin = await getJorionAdminClient();
  const members = await listOrgMembers(admin, orgId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Status (operator-suspend) */}
      <Card>
        <h3 style={sectionTitle}>Status</h3>
        <p style={{ ...labelStyle, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill tone={suspended ? 'danger' : 'success'} dot>
            {suspended ? 'Opgeschort' : 'Actief'}
          </Pill>
          {suspended
            ? 'De widget rendert niet en de chatbot toont een eerlijke "tijdelijk niet beschikbaar"-melding.'
            : 'De chatbot is beschikbaar. Pauzeer om een niet-betalende klant tijdelijk stil te zetten.'}
        </p>
        <SuspendOrgForm orgId={orgId} suspended={suspended} />
      </Card>

      {/* Leden */}
      <Card>
        <h3 style={sectionTitle}>Leden</h3>
        <p style={{ ...labelStyle, margin: '0 0 12px' }}>
          Nodig teamleden uit, stuur een invite opnieuw of verwijder een lid. De laatste owner kan niet worden verwijderd.
        </p>
        <MembersManager orgId={orgId} members={members} />
      </Card>

      {/* Dagbudget */}
      <Card>
        <h3 style={sectionTitle}>Dagbudget</h3>
        <p style={{ ...labelStyle, margin: '0 0 10px' }}>
          Huidig: {capEur === 0 ? 'uit' : `€${capEur.toFixed(2)}`}/dag.
          0 = budget uit (bot weigert bij overschrijding). Bovengrens €1000/dag.
        </p>
        <BudgetEditor orgId={orgId} currentEur={capEur} />
      </Card>

      {/* Data-export */}
      <Card>
        <h3 style={sectionTitle}>Exporteren (AVG)</h3>
        <p style={{ ...labelStyle, margin: '0 0 10px' }}>
          Download alle data van deze organisatie als JSON (gegevensportabiliteit).
        </p>
        <a
          href={`/v1/admin/organizations/${orgId}/export`}
          className="klant-btn"
          data-variant="secondary"
          style={{ padding: '8px 14px', display: 'inline-block' }}
        >
          Exporteer org-data (JSON)
        </a>
      </Card>

      {/* Gevarenzone */}
      <Card>
        <h3 style={{ ...sectionTitle, color: 'var(--klant-danger)' }}>Gevarenzone</h3>
        <DeleteOrgForm orgId={orgId} slug={slug} />
      </Card>
    </div>
  );
}
