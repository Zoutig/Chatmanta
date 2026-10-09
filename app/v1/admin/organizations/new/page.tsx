import Link from 'next/link';
import { requireJorionAdmin } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { NewOrgForm } from './new-org-form';

// V1 M1 — admin: nieuwe klant-organisatie aanmaken. requireJorionAdmin gate't de
// pagina (geen sessie → redirect /v1/login; ingelogd-maar-niet-admin → "Geen toegang").
export const dynamic = 'force-dynamic';

export default async function NewOrganizationPage() {
  try {
    await requireJorionAdmin();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  return (
    <div className="v1-page v1-page--narrow">
      <Link href="/v1/admin/organizations" className="v1-section-link">
        Terug naar klanten
      </Link>
      <PageHeader
        title="Nieuwe klant"
        description="Maakt de organisatie en één chatbot aan, en stuurt de eigenaar een uitnodiging per e-mail."
      />
      <NewOrgForm />
    </div>
  );
}
