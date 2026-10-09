// V1 admin — Privacy en data tab (server RSC).
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getPrivacy } from '@/lib/v1/admin/privacy';
import { InfoTip } from '@/app/v1/_ui/feedback';
import { formatDate } from '@/app/v1/admin/_ui/format';
import { PrivacyForm } from '../_components/privacy-form';

function dateOrNever(iso: string | null): string {
  return iso ? formatDate(iso) : 'Nog niet';
}

export async function PrivacyTab({ orgId }: { orgId: string }) {
  const admin = await getJorionAdminClient();
  const privacy = await getPrivacy(admin, orgId);

  return (
    <section className="v1-card">
      <div className="v1-adm-card-head">
        <h2 className="v1-section-title v1-adm-title-row">
          Bewaartermijnen en AVG
          <InfoTip text="De instellingen worden opgeslagen. Het daadwerkelijk opschonen loopt later via een geplande taak (V2)." />
        </h2>
      </div>
      <div className="v1-adm-stat-row" style={{ margin: '0 0 16px' }}>
        <div className="v1-adm-stat">
          <span className="v1-adm-stat-label">Laatste export</span>
          <span>{dateOrNever(privacy.lastDataExportAt)}</span>
        </div>
        <div className="v1-adm-stat">
          <span className="v1-adm-stat-label">Laatste verwijdering</span>
          <span>{dateOrNever(privacy.lastDataDeletionAt)}</span>
        </div>
      </div>
      <PrivacyForm orgId={orgId} privacy={privacy} />
    </section>
  );
}
