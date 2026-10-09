// V1 admin — Onboarding tab (server RSC).
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { listOnboardingItems } from '@/lib/v1/admin/onboarding';
import { OnboardingChecklist } from '../_components/onboarding-checklist';

export async function OnboardingTab({ orgId }: { orgId: string }) {
  const admin = await getJorionAdminClient();
  const items = await listOnboardingItems(admin, orgId);
  return (
    <section className="v1-card">
      <OnboardingChecklist orgId={orgId} items={items} />
    </section>
  );
}
