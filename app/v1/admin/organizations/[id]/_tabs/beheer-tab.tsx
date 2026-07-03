// V1 admin — Beheer tab (server RSC).
// Wraps de bestaande BudgetEditor + DeleteOrgForm + export-link uit [id]/.
// Bewust geen nieuwe logica: hergebruik van de al geteste componenten.

import { resolveDailyBudgetEur } from '@/lib/v1/limits/usage-limits';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { BudgetEditor } from '../budget-editor';
import { DeleteOrgForm } from '../delete-org-form';

const labelStyle = { fontSize: 12, color: 'var(--klant-muted)' } as const;
const sectionTitle = { fontSize: 14, fontWeight: 600, margin: '0 0 8px', color: 'var(--klant-ink)' } as const;

type Props = {
  orgId: string;
  slug: string;
  dailyBudgetRaw: number | string | null;
};

export function BeheerTab({ orgId, slug, dailyBudgetRaw }: Props) {
  const capEur = resolveDailyBudgetEur(dailyBudgetRaw);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
