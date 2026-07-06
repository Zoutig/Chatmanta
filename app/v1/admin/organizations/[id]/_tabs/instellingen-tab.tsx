// V1 admin — Botinstellingen tab (server RSC). Laadt de chatbot-settings van de org
// via de Jorion-admin-service-role en rendert de admin-variant van het instellingen-
// formulier. Schrijven gaat via adminSaveChatbotSettingsAction (org uit de route-param).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { AdminSettingsForm } from '../admin-settings-form';

const dim = { fontSize: 13, color: 'var(--klant-muted)' } as const;

export async function InstellingenTab({ orgId, chatbotId }: { orgId: string; chatbotId: string | null }) {
  if (!chatbotId) {
    return (
      <Card>
        <p style={dim}>Deze organisatie heeft nog geen chatbot om in te stellen.</p>
      </Card>
    );
  }
  const admin = await getJorionAdminClient();
  const settings = await getChatbotSettings(admin, chatbotId);
  return <AdminSettingsForm orgId={orgId} initial={settings} />;
}
