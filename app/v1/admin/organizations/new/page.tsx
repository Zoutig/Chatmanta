import Link from 'next/link';
import { requireJorionAdmin } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { NewOrgForm } from './new-org-form';

// V1 M1 — admin: nieuwe klant-organisatie aanmaken. requireJorionAdmin gate't de
// pagina (geen sessie → redirect /v1/login; ingelogd-maar-niet-admin → "Geen toegang").
export const dynamic = 'force-dynamic';

export default async function NewOrganizationPage() {
  try {
    await requireJorionAdmin();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  return (
    <>
      <PageHead
        eyebrow={<Link href="/v1/admin/organizations">← Organisaties</Link>}
        title="Nieuwe klant"
        subtitle="Maakt de organisatie + één chatbot aan en nodigt de owner uit per e-mail (magic-link)."
      />
      <div style={{ maxWidth: 480 }}>
        <NewOrgForm />
      </div>
    </>
  );
}
