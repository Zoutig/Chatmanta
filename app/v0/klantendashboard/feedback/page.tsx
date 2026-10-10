// Klantendashboard — Feedback / melding indienen. De klant vult een
// gestructureerde melding in; de operator (Niels) beheert hem in het Admin
// Dashboard. De status is bewust NIET zichtbaar voor de klant.

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getMockAccountInfo } from '@/lib/v0/klantendashboard/mock/account';
import { getAccountOverrides } from '@/lib/v0/klantendashboard/server/settings';
import { Card } from '../components/ui/card';
import { FeedbackForm } from './components/feedback-form';

export const metadata = { title: 'Feedback · ChatManta' };
export const dynamic = 'force-dynamic';

export default async function FeedbackPage() {
  // Voorvullen (item 8): naam + e-mail uit de account-gegevens (override wint
  // over mock), maar de velden blijven bewerkbaar. Geen usage nodig → 0/0.
  const activeOrg = await getActiveOrgFromCookies();
  const overrides = await getAccountOverrides(activeOrg.slug);
  const account = getMockAccountInfo(activeOrg.slug, { conversationsThisMonth: 0, documentsCount: 0 });
  const initialName = overrides.contactPerson ?? account.contactPerson;
  const initialEmail = overrides.email ?? account.email;

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Feedback &amp; meldingen</h1>
          <p className="klant-page-sub">
            Iets niet goed gegaan, een idee, of een fout in een bot-antwoord? Laat het ons
            weten. Hoe duidelijker je het omschrijft, hoe sneller we het kunnen oppakken.
          </p>
        </div>
      </header>

      <Card style={{ maxWidth: 720 }}>
        <FeedbackForm initialName={initialName} initialEmail={initialEmail} />
      </Card>
    </>
  );
}
