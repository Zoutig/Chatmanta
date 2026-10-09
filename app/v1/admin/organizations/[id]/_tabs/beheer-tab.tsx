// V1 admin — Beheer tab (server RSC).
// Wraps de bestaande BudgetEditor + DeleteOrgForm + export-link uit [id]/ en voegt
// ledenbeheer toe (uitnodigen / invite opnieuw / verwijderen — MembersManager).

import { resolveDailyBudgetEur } from '@/lib/v1/limits/usage-limits';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { listOrgMembers } from '@/lib/v1/admin/members';
import { Badge, InfoTip } from '@/app/v1/_ui/feedback';
import { buttonClass } from '@/app/v1/_ui/button';
import { formatEur } from '@/app/v1/admin/_ui/format';
import { BudgetEditor } from '../budget-editor';
import { DeleteOrgForm } from '../delete-org-form';
import { MembersManager } from '../members-manager';
import { SuspendOrgForm } from '../suspend-org-form';

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
    <div className="v1-stack">
      {/* Status (operator-suspend) */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Status</h2>
        </div>
        <p className="v1-adm-strip v1-adm-muted" style={{ margin: '0 0 12px' }}>
          <Badge tone={suspended ? 'danger' : 'ok'} dot>
            {suspended ? 'Opgeschort' : 'Actief'}
          </Badge>
          <span>
            {suspended
              ? 'De widget verschijnt niet en de chatbot meldt dat hij tijdelijk niet beschikbaar is.'
              : 'De chatbot is beschikbaar. Pauzeer om een niet-betalende klant tijdelijk stil te zetten.'}
          </span>
        </p>
        <SuspendOrgForm orgId={orgId} suspended={suspended} />
      </section>

      {/* Leden */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title v1-adm-title-row">
            Leden
            <InfoTip text="Nodig teamleden uit, stuur een uitnodiging opnieuw of verwijder een lid. De laatste eigenaar kan niet worden verwijderd." />
          </h2>
        </div>
        <MembersManager orgId={orgId} members={members} />
      </section>

      {/* Dagbudget */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title v1-adm-title-row">
            Dagbudget
            <InfoTip text="0 betekent budget uit. Bij overschrijding weigert de bot verdere vragen. De bovengrens is 1000 euro per dag." />
          </h2>
        </div>
        <p className="v1-adm-muted" style={{ margin: '0 0 12px' }}>
          Huidig: {capEur === 0 ? 'Uit' : `${formatEur(capEur)} per dag`}
        </p>
        <BudgetEditor orgId={orgId} currentEur={capEur} />
      </section>

      {/* Data-export */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Exporteren (AVG)</h2>
        </div>
        <p className="v1-adm-muted" style={{ margin: '0 0 12px' }}>
          Download alle data van deze organisatie als JSON (gegevensportabiliteit).
        </p>
        <a href={`/v1/admin/organizations/${orgId}/export`} className={buttonClass({ variant: 'secondary' })}>
          Exporteer organisatiedata (JSON)
        </a>
      </section>

      {/* Gevarenzone */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title v1-adm-danger">Gevarenzone</h2>
        </div>
        <DeleteOrgForm orgId={orgId} slug={slug} />
      </section>
    </div>
  );
}
