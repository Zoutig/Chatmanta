import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { EmptyState } from '@/app/v1/_ui/feedback';
import { DataTable } from '../_ui/data-table';
import { formatDateTime } from '../_ui/format';
import Link from 'next/link';

// V1 §1.5 #9 — admin: audit-log-tabel ZONDER geavanceerde filters. Read-only weergave
// van public.audit_logs (interne mutatie-trail: org.create, org_deleted, …). Cross-org
// lezen via getJorionAdminClient() (service-role NA requireJorionAdmin — audit_logs is
// service-role-only onder RLS; admin is geen member). Geen IDs uit client-input → geen
// SA-1-guard nodig. Bewust simpel (laatste 100, geen filter-UI — dat is V2).
export const dynamic = 'force-dynamic';

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
  // Many-to-one embed: runtime een object, in de gegenereerde types soms een array.
  organizations: { name: string } | { name: string }[] | null;
};

const orgNameOf = (r: AuditRow): string | null =>
  Array.isArray(r.organizations) ? (r.organizations[0]?.name ?? null) : (r.organizations?.name ?? null);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function compact(meta: Record<string, unknown> | null): string {
  if (!meta || Object.keys(meta).length === 0) return 'Geen';
  const s = JSON.stringify(meta);
  return s.length > 120 ? s.slice(0, 119) + '…' : s;
}

const shortId = (id: string | null) => (id ? `${id.slice(0, 8)}…` : 'Geen');

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const sp = await searchParams;
  // ?org=<uuid>: alleen de wijzigingen bij één klant (link vanaf de klant-detail).
  const orgFilter = sp.org && UUID_RE.test(sp.org) ? sp.org : null;
  let admin;
  try {
    admin = await getJorionAdminClient(); // gate't intern via requireJorionAdmin
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }

  let q = admin
    .from('audit_logs')
    .select('id, created_at, action, organization_id, user_id, target_type, target_id, ip_hash, metadata, organizations(name)');
  if (orgFilter) q = q.eq('organization_id', orgFilter);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(100);

  const rows = (data ?? []) as AuditRow[];

  return (
    <div className="v1-page">
      <PageHeader
        title="Auditlog"
        description={
          orgFilter
            ? `De laatste ${rows.length} wijzigingen door admins bij ${rows[0] ? (orgNameOf(rows[0]) ?? 'deze klant') : 'deze klant'}. Alleen-lezen.`
            : `De laatste ${rows.length} wijzigingen door admins, over alle klanten. Alleen-lezen.`
        }
        actions={
          orgFilter ? (
            <span className="v1-adm-inline">
              <Link href={`/v1/admin/organizations/${orgFilter}`} className="v1-section-link">
                Naar de klant
              </Link>
              <Link href="/v1/admin/audit" className="v1-section-link">
                Alle klanten
              </Link>
            </span>
          ) : undefined
        }
      />

      {error ? (
        <p role="alert" className="v1-alert v1-alert--error">
          Kon de auditlog niet laden: {error.message}
        </p>
      ) : null}

      <section className="v1-card">
        {rows.length === 0 && !error ? (
          <EmptyState>Nog geen wijzigingen gelogd.</EmptyState>
        ) : (
          <DataTable
            label="Auditlog"
            columns={[
              { label: 'Tijd' },
              { label: 'Actie' },
              { label: 'Klant' },
              { label: 'Gebruiker' },
              { label: 'Doel' },
              { label: 'Details' },
            ]}
          >
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="v1-adm-muted" style={{ whiteSpace: 'nowrap' }} title={r.created_at}>
                  {formatDateTime(r.created_at)}
                </td>
                <td style={{ fontWeight: 600 }}>{r.action}</td>
                <td>
                  {r.organization_id ? (
                    <Link href={`/v1/admin/audit?org=${r.organization_id}`} className="v1-link" title="Alleen deze klant">
                      {orgNameOf(r) ?? shortId(r.organization_id)}
                    </Link>
                  ) : (
                    'Geen'
                  )}
                </td>
                <td className="v1-adm-muted" title={r.user_id ?? ''}>
                  {shortId(r.user_id)}
                </td>
                <td className="v1-adm-muted">
                  {r.target_type ?? 'Geen'}
                  {r.target_id ? ` (${r.target_id.slice(0, 8)}…)` : ''}
                </td>
                <td className="v1-adm-muted" title={r.ip_hash ? `ip_hash: ${r.ip_hash}` : ''}>
                  <span className="v1-adm-clip">{compact(r.metadata)}</span>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}
