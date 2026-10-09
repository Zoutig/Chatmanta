// V1 admin — Botinstellingen tab (server RSC). Laadt de chatbot-settings van de org
// via de Jorion-admin-service-role en rendert de admin-variant van het instellingen-
// formulier. Schrijven gaat via adminSaveChatbotSettingsAction (org uit de route-param).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import { EmptyState } from '@/app/v1/_ui/feedback';
import { AdminSettingsForm } from '../admin-settings-form';

export async function InstellingenTab({ orgId, chatbotId }: { orgId: string; chatbotId: string | null }) {
  if (!chatbotId) {
    return (
      <section className="v1-card">
        <EmptyState>Deze organisatie heeft nog geen chatbot om in te stellen.</EmptyState>
      </section>
    );
  }
  const admin = await getJorionAdminClient();
  const settings = await getChatbotSettings(admin, chatbotId);
  return <AdminSettingsForm orgId={orgId} initial={settings} />;
}
