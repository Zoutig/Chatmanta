// V1 admin — Onboarding tab (server RSC). Opgeslagen checklist + wat uit de data
// blijkt (lib/v1/admin/onboarding-derive.ts), zonder extra writes.
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getOnboardingFacts, listOnboardingItems } from '@/lib/v1/admin/onboarding';
import { deriveOnboarding } from '@/lib/v1/admin/onboarding-derive';
import { OnboardingChecklist } from '../_components/onboarding-checklist';

export async function OnboardingTab({ orgId }: { orgId: string }) {
  const admin = await getJorionAdminClient();
  const [items, facts] = await Promise.all([listOnboardingItems(admin, orgId), getOnboardingFacts(admin, orgId)]);
  return (
    <section className="v1-card">
      <OnboardingChecklist orgId={orgId} items={deriveOnboarding(items, facts)} />
    </section>
  );
}
