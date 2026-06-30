import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';

// V1 §1.5 #9 — admin: audit-log-tabel ZONDER geavanceerde filters. Read-only weergave
// van public.audit_logs (interne mutatie-trail: org.create, org_deleted, …). Cross-org
// lezen via getJorionAdminClient() (service-role NA requireJorionAdmin — audit_logs is
// service-role-only onder RLS; admin is geen member). Geen IDs uit client-input → geen
// SA-1-guard nodig. Bewust simpel (laatste 100, geen filter-UI — dat is V2).
export const dynamic = 'force-dynamic';

const SHELL = { maxWidth: 1040, margin: '8vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' } as const;
const TD = { padding: '6px 8px', verticalAlign: 'top' as const };
const MUTED = { ...TD, color: '#555' };

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
        <main style={SHELL}>
          <h1 style={{ fontSize: 20 }}>Geen toegang</h1>
          <p style={{ fontSize: 14, color: '#555' }}>Deze pagina is alleen voor Jorion-admins.</p>
        </main>
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
    <main style={SHELL}>
      <h1 style={{ fontSize: 22 }}>Audit-log</h1>
      <p style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
        Laatste {rows.length} interne admin-mutaties (alle organisaties). Read-only.
      </p>
      {error && (
        <p role="alert" style={{ color: '#b00020', fontSize: 13 }}>
          Kon de audit-log niet laden: {error.message}
        </p>
      )}
      {rows.length === 0 && !error ? (
        <p style={{ fontSize: 14, color: '#555', marginTop: 12 }}>Nog geen audit-entries.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={TD}>Tijd</th>
              <th style={TD}>Actie</th>
              <th style={TD}>Organisatie</th>
              <th style={TD}>Actor (user)</th>
              <th style={TD}>Doel</th>
              <th style={TD}>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={MUTED} title={r.created_at}>{new Date(r.created_at).toLocaleString('nl-NL')}</td>
                <td style={{ ...TD, fontWeight: 600 }}>{r.action}</td>
                <td style={TD}>{r.organizations?.[0]?.name ?? (r.organization_id ? r.organization_id.slice(0, 8) + '…' : '—')}</td>
                <td style={MUTED} title={r.user_id ?? ''}>{r.user_id ? r.user_id.slice(0, 8) + '…' : '—'}</td>
                <td style={MUTED}>
                  {r.target_type ?? '—'}
                  {r.target_id ? ` (${r.target_id.slice(0, 8)}…)` : ''}
                </td>
                <td style={{ ...MUTED, maxWidth: 320, wordBreak: 'break-word' as const }} title={r.ip_hash ? `ip_hash: ${r.ip_hash}` : ''}>
                  {compact(r.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
