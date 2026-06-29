import Link from 'next/link';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';

// V1 M1 — admin: kale lijst van klant-organisaties. Leest via getJorionAdminClient()
// (cross-org service-role NA requireJorionAdmin — admin is geen member, dus NIET de
// RLS-session-client). Geen IDs uit client-input → geen SA-1 404-guard nodig.
export const dynamic = 'force-dynamic';

const SHELL = { maxWidth: 760, margin: '8vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' } as const;

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
        <main style={SHELL}>
          <h1 style={{ fontSize: 20 }}>Geen toegang</h1>
          <p style={{ fontSize: 14, color: '#555' }}>Deze pagina is alleen voor Jorion-admins.</p>
        </main>
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
    <main style={SHELL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 22 }}>Organisaties</h1>
        <Link href="/v1/admin/organizations/new">+ Nieuwe klant</Link>
      </div>
      {error && (
        <p role="alert" style={{ color: '#b00020', fontSize: 13 }}>
          Kon de organisaties niet laden: {error.message}
        </p>
      )}
      {rows.length === 0 && !error ? (
        <p style={{ fontSize: 14, color: '#555' }}>Nog geen organisaties.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={{ padding: '6px 8px' }}>Naam</th>
              <th style={{ padding: '6px 8px' }}>Slug</th>
              <th style={{ padding: '6px 8px' }}>Aangemaakt</th>
              <th style={{ padding: '6px 8px' }}>Leden</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '6px 8px' }}>{o.name}</td>
                <td style={{ padding: '6px 8px', color: '#555' }}>{o.slug}</td>
                <td style={{ padding: '6px 8px', color: '#555' }}>
                  {new Date(o.created_at).toLocaleDateString('nl-NL')}
                </td>
                <td style={{ padding: '6px 8px' }}>{o.organization_members?.[0]?.count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
