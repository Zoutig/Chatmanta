// V1 admin — Botinstellingen tab (server RSC). Laadt de chatbot-settings van de org
// via de Jorion-admin-service-role en rendert de admin-variant van het instellingen-
// formulier. Schrijven gaat via adminSaveChatbotSettingsAction (org uit de route-param).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import { EmptyState, InfoTip } from '@/app/v1/_ui/feedback';
import { Panel, Row, Rows } from '@/app/v1/_ui/panel';
import { isIndexVersion } from '@/lib/rag/index-version';
import { embeddingLabel, getV1ModelInfo } from '../../../_ui/model-info';
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
  const [settings, botRes] = await Promise.all([
    getChatbotSettings(admin, chatbotId),
    admin
      .from('chatbots')
      .select('bot_version, index_version')
      .eq('organization_id', orgId)
      .eq('id', chatbotId)
      .maybeSingle(),
  ]);
  const bot = botRes.data as { bot_version: string | null; index_version: string | null } | null;
  const models = getV1ModelInfo();
  const indexVersion = isIndexVersion(bot?.index_version) ? bot.index_version : null;

  return (
    <div className="v1-stack">
      <Panel title="Wat deze chatbot draait">
        <Rows>
          <Row label="Botversie (chatbot)">
            {bot?.bot_version ?? 'Onbekend'}{' '}
            <InfoTip text="Het label op de chatbot. Het gedrag komt van de geërfde V0-botversie (LATEST) plus de V1-instellingen; zie Instellingen." />
          </Row>
          <Row label="Geërfde botversie">{models.inheritedBotVersion}</Row>
          <Row label="Index-versie">{indexVersion ? embeddingLabel(indexVersion) : (bot?.index_version ?? 'Onbekend')}</Row>
          <Row label="Antwoordmodel">{models.chatModel}</Row>
        </Rows>
      </Panel>
      <AdminSettingsForm orgId={orgId} initial={settings} />
    </div>
  );
}
