import Link from 'next/link';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { Card } from '@/app/klantendashboard/components/ui/card';

// V1 M1 — admin: lijst van klant-organisaties. Leest via getJorionAdminClient()
// (cross-org service-role NA requireJorionAdmin — admin is geen member, dus NIET de
// RLS-session-client). Geen IDs uit client-input → geen SA-1 404-guard nodig.
export const dynamic = 'force-dynamic';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  organization_members: { count: number }[] | null;
};

export default async function OrganizationsPage() {
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
    .from('organizations')
    .select('id, name, slug, created_at, organization_members(count)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as OrgRow[];

  return (
    <>
      <PageHead
        title="Klanten"
        subtitle="Alle klant-organisaties. Klik een naam aan voor de deep-dive."
        actions={
          <Link href="/v1/admin/organizations/new" className="klant-btn" data-variant="primary">
            + Nieuwe klant
          </Link>
        }
      />

      {error && (
        <p role="alert" style={{ color: 'var(--klant-danger)', fontSize: 13 }}>
          Kon de organisaties niet laden: {error.message}
        </p>
      )}

      {rows.length === 0 && !error ? (
        <div className="klant-empty">
          <p className="klant-empty-title">Nog geen organisaties</p>
          <p className="klant-empty-sub">Maak je eerste klant aan via &lsquo;+ Nieuwe klant&rsquo;.</p>
        </div>
      ) : (
        <Card padded={false} style={{ overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Slug</th>
                <th>Leden</th>
                <th>Aangemaakt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 500 }}>
                    <Link href={`/v1/admin/organizations/${o.id}`}>{o.name}</Link>
                  </td>
                  <td style={{ color: 'var(--klant-muted)' }}>{o.slug}</td>
                  <td>{o.organization_members?.[0]?.count ?? 0}</td>
                  <td style={{ color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(o.created_at).toLocaleDateString('nl-NL')}
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
