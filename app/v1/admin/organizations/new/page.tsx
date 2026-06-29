import Link from 'next/link';
import { requireJorionAdmin } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { NewOrgForm } from './new-org-form';

// V1 M1 — admin: nieuwe klant-organisatie aanmaken. requireJorionAdmin gate't de
// pagina (geen sessie → redirect /v1/login; ingelogd-maar-niet-admin → "Geen toegang").
// Minimale inline-styled UI (geen V0 klant.css-chrome); aparte admin-mijlpaal polisht.
export const dynamic = 'force-dynamic';

const SHELL = { maxWidth: 480, margin: '10vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' } as const;

export default async function NewOrganizationPage() {
  try {
    await requireJorionAdmin();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <main style={SHELL}>
          <h1 style={{ fontSize: 20 }}>Geen toegang</h1>
          <p style={{ fontSize: 14, color: '#555' }}>Deze pagina is alleen voor Jorion-admins.</p>
        </main>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  return (
    <main style={SHELL}>
      <p style={{ fontSize: 13, marginBottom: 8 }}>
        <Link href="/v1/admin/organizations">← Organisaties</Link>
      </p>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Nieuwe klant</h1>
      <p style={{ fontSize: 13, color: '#555', marginTop: 0, marginBottom: 20 }}>
        Maakt de organisatie + één chatbot aan en nodigt de owner uit per e-mail (magic-link).
      </p>
      <NewOrgForm />
    </main>
  );
}
