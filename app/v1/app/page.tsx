import { requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';

// Beschermde V1-pagina (fundament-proof). Bewijst de auth-keten:
//   geen sessie  → requireOrgMember → requireAuth → redirect /v1/login
//   wél lid      → pagina rendert ("Ingelogd als …")
//   geen lid     → AUTH_FORBIDDEN → "Geen toegang"
// orgId komt uit V1_SEED_ORG_ID (de geseede demo-org). Bij de kernel-graduatie
// wordt dit een echte org-resolutie (route-param / membership-lookup).
export const dynamic = 'force-dynamic';

export default async function V1AppPage() {
  const orgId = process.env.V1_SEED_ORG_ID;
  if (!orgId) {
    return (
      <main style={{ maxWidth: 480, margin: '12vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 20 }}>Config-fout</h1>
        <p style={{ fontSize: 14, color: '#555' }}>V1_SEED_ORG_ID ontbreekt in de omgeving.</p>
      </main>
    );
  }

  let user;
  try {
    // Redirect (geen sessie) gooit een NEXT_REDIRECT-fout die GEEN AppError is →
    // valt door naar de re-throw onderaan, zodat de redirect werkt.
    user = await requireOrgMember(orgId);
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <main style={{ maxWidth: 480, margin: '12vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 20 }}>Geen toegang</h1>
          <p style={{ fontSize: 14, color: '#555' }}>Je bent geen lid van deze organisatie.</p>
        </main>
      );
    }
    throw e;
  }

  return (
    <main style={{ maxWidth: 480, margin: '12vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20 }}>V1 — beschermde pagina</h1>
      <p style={{ fontSize: 14, color: '#333' }}>
        Ingelogd als <strong>{user.email}</strong>. Je bent lid van de organisatie.
      </p>
    </main>
  );
}
