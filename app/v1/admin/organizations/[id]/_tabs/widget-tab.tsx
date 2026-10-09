// V1 admin — Widget tab (server RSC). Read-only levenscyclus-status (is_active /
// widget_last_seen_at / widget_last_seen_origin, migratie 0023) zodat support de
// live-status ziet, de Jorion-beheerde widget-domeinen (allowed_domains) en de
// admin-variant van het widget-uiterlijk-formulier.

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import { Badge, EmptyState, InfoTip } from '@/app/v1/_ui/feedback';
import { Panel, Rows, Row } from '@/app/v1/_ui/panel';
import { formatDateTime } from '@/app/v1/admin/_ui/format';
import { AdminWidgetForm } from '../admin-widget-form';
import { AllowedDomainsEditor } from '../allowed-domains-editor';

export async function WidgetTab({ orgId, chatbotId }: { orgId: string; chatbotId: string | null }) {
  if (!chatbotId) {
    return (
      <section className="v1-card">
        <EmptyState>Deze organisatie heeft nog geen chatbot of widget.</EmptyState>
      </section>
    );
  }
  const admin = await getJorionAdminClient();
  const settings = await getChatbotSettings(admin, chatbotId);

  const { data: bot } = await admin
    .from('chatbots')
    .select('is_active, widget_last_seen_at, widget_last_seen_origin, allowed_domains')
    .eq('id', chatbotId)
    .maybeSingle();

  const isActive = bot?.is_active !== false;
  const lastSeenAt = (bot?.widget_last_seen_at as string | null) ?? null;
  const lastSeenOrigin = (bot?.widget_last_seen_origin as string | null) ?? null;
  const allowedDomains = ((bot?.allowed_domains as string[] | null) ?? []).filter(Boolean);

  return (
    <div className="v1-stack">
      {/* Live-status (read-only) */}
      <Panel
        title="Live-status"
        meta={
          <InfoTip text="Pauzeren en activeren doet de klant zelf in de widget-instellingen. Dit paneel is alleen-lezen voor support." />
        }
      >
        <Rows>
          <Row label="Status">
            <Badge tone={isActive ? 'ok' : 'warn'} dot>
              {isActive ? 'Actief' : 'Gepauzeerd'}
            </Badge>
          </Row>
          <Row label="Gevonden op website">
            {lastSeenAt ? (
              <Badge tone="ok">{lastSeenOrigin ? `Ja, op ${lastSeenOrigin}` : 'Ja'}</Badge>
            ) : (
              <Badge tone="warn">Nog niet gezien</Badge>
            )}
          </Row>
          <Row label="Laatst gezien">{lastSeenAt ? formatDateTime(lastSeenAt) : 'Nog niet gezien'}</Row>
          <Row label="Domeinen">
            {allowedDomains.length > 0 ? `${allowedDomains.length} ingesteld` : 'Geen beperking'}
          </Row>
        </Rows>
      </Panel>

      {/* Toegestane domeinen (Jorion-beheerd; klant ziet ze read-only) */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Toegestane websites</h2>
        </div>
        <AllowedDomainsEditor orgId={orgId} current={allowedDomains} />
      </section>

      {/* Uiterlijk (bewerkbaar) */}
      <AdminWidgetForm orgId={orgId} initial={settings} />
    </div>
  );
}
