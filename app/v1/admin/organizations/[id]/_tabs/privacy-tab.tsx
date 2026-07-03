// V1 admin — Privacy & Data tab (server RSC).
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getPrivacy } from '@/lib/v1/admin/privacy';
import { formatDateNL } from '@/lib/controlroom/format';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { PrivacyForm } from '../_components/privacy-form';

export async function PrivacyTab({ orgId }: { orgId: string }) {
  const admin = await getJorionAdminClient();
  const privacy = await getPrivacy(admin, orgId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--klant-ink)' }}>
          Bewaartermijnen &amp; AVG
        </div>
        <p className="klant-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          Instellingen worden opgeslagen. De daadwerkelijke opschoning loopt via een geplande service
          (V2). Laatste export: {formatDateNL(privacy.lastDataExportAt)} · laatste verwijdering:{' '}
          {formatDateNL(privacy.lastDataDeletionAt)}.
        </p>
        <PrivacyForm orgId={orgId} privacy={privacy} />
      </Card>
    </div>
  );
}
