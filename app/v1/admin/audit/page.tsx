import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { Card } from '@/app/klantendashboard/components/ui/card';

// V1 §1.5 #9 — admin: audit-log-tabel ZONDER geavanceerde filters. Read-only weergave
// van public.audit_logs (interne mutatie-trail: org.create, org_deleted, …). Cross-org
// lezen via getJorionAdminClient() (service-role NA requireJorionAdmin — audit_logs is
// service-role-only onder RLS; admin is geen member). Geen IDs uit client-input → geen
// SA-1-guard nodig. Bewust simpel (laatste 100, geen filter-UI — dat is V2).
export const dynamic = 'force-dynamic';

const truncCell = {
  maxWidth: 320,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  organization_id: string | null;
  user_id: string | null;
  target_type: string | null;
  target_id: string | null;
  ip_hash: string | null;
  metadata: Record<string, unknown> | null;
  organizations: { name: string }[] | null;
};

function compact(meta: Record<string, unknown> | null): string {
  if (!meta || Object.keys(meta).length === 0) return '—';
  const s = JSON.stringify(meta);
  return s.length > 120 ? s.slice(0, 119) + '…' : s;
}

export default async function AuditLogPage() {
  let admin;
  try {
    admin = await getJorionAdminClient(); // gate't intern via requireJorionAdmin
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }

  const { data, error } = await admin
    .from('audit_logs')
    .select('id, created_at, action, organization_id, user_id, target_type, target_id, ip_hash, metadata, organizations(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as AuditRow[];

  return (
    <>
      <PageHead
        title="Audit-log"
        subtitle={`Laatste ${rows.length} interne admin-mutaties (alle organisaties). Read-only.`}
      />

      {error && (
        <p role="alert" style={{ color: 'var(--klant-danger)', fontSize: 13 }}>
          Kon de audit-log niet laden: {error.message}
        </p>
      )}

      {rows.length === 0 && !error ? (
        <div className="klant-empty">
          <p className="klant-empty-title">Nog geen audit-entries</p>
          <p className="klant-empty-sub">Interne admin-mutaties verschijnen hier zodra ze plaatsvinden.</p>
        </div>
      ) : (
        <Card padded={false} style={{ overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Tijd</th>
                <th>Actie</th>
                <th>Organisatie</th>
                <th>Actor (user)</th>
                <th>Doel</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--klant-muted)', whiteSpace: 'nowrap' }} title={r.created_at}>
                    {new Date(r.created_at).toLocaleString('nl-NL')}
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.action}</td>
                  <td>{r.organizations?.[0]?.name ?? (r.organization_id ? r.organization_id.slice(0, 8) + '…' : '—')}</td>
                  <td style={{ color: 'var(--klant-muted)' }} title={r.user_id ?? ''}>
                    {r.user_id ? r.user_id.slice(0, 8) + '…' : '—'}
                  </td>
                  <td style={{ color: 'var(--klant-muted)' }}>
                    {r.target_type ?? '—'}
                    {r.target_id ? ` (${r.target_id.slice(0, 8)}…)` : ''}
                  </td>
                  <td style={{ ...truncCell, color: 'var(--klant-muted)' }} title={r.ip_hash ? `ip_hash: ${r.ip_hash}` : ''}>
                    {compact(r.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
