// V1 admin — Widget tab (server RSC). Read-only levenscyclus-status (is_active /
// widget_last_seen_at / widget_last_seen_origin, migratie 0023) zodat support de
// live-status ziet, de Jorion-beheerde widget-domeinen (allowed_domains) en de
// admin-variant van het widget-uiterlijk-formulier.

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { AdminWidgetForm } from '../admin-widget-form';
import { AllowedDomainsEditor } from '../allowed-domains-editor';

const dim = { fontSize: 13, color: 'var(--klant-muted)' } as const;
const cellLabel = { fontSize: 11, color: 'var(--klant-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.03em' };

function formatLastSeen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export async function WidgetTab({ orgId, chatbotId }: { orgId: string; chatbotId: string | null }) {
  if (!chatbotId) {
    return (
      <Card>
        <p style={dim}>Deze organisatie heeft nog geen chatbot / widget.</p>
      </Card>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Live-status (read-only) */}
      <Card>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--klant-ink)' }}>Live-status</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Cell label="Status" value={isActive ? 'Actief' : 'Gepauzeerd'} tone={isActive ? 'success' : 'warning'} />
          <Cell label="Gevonden op website" value={lastSeenAt ? (lastSeenOrigin ? `Ja — ${lastSeenOrigin}` : 'Ja') : 'Nog niet gezien'} tone={lastSeenAt ? 'success' : 'warning'} />
          <Cell label="Laatst gezien" value={formatLastSeen(lastSeenAt)} tone="neutral" />
          <Cell label="Domeinen" value={allowedDomains.length > 0 ? `${allowedDomains.length} geconfigureerd` : 'Geen beperking'} tone="neutral" />
        </div>
        <p style={{ ...dim, margin: '10px 0 0' }}>
          Pauzeren/activeren doet de klant zelf in de widget-instellingen; dit paneel is read-only voor support.
        </p>
      </Card>

      {/* Toegestane domeinen (Jorion-beheerd; klant ziet ze read-only) */}
      <Card>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--klant-ink)' }}>Toegestane websites</h3>
        <AllowedDomainsEditor orgId={orgId} current={allowedDomains} />
      </Card>

      {/* Uiterlijk (bewerkbaar) */}
      <AdminWidgetForm orgId={orgId} initial={settings} />
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone: 'success' | 'warning' | 'neutral' }) {
  const color = tone === 'success' ? 'var(--klant-success)' : tone === 'warning' ? 'var(--klant-warning)' : 'var(--klant-ink)';
  return (
    <div style={{ padding: 12, background: 'var(--klant-surface)', borderRadius: 'var(--klant-r-sm)' }}>
      <div style={cellLabel}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
