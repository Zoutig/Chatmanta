// V1 klant-feedback pagina — port van app/klantendashboard/feedback/page.tsx.
// Auth: getSessionOrg (redirect naar /v1/login bij geen sessie).
// Voorvullen: e-mail uit sessie; naam leeg (V1 heeft geen contactPerson-override).

import { isAppError } from '@/lib/errors/app-error';
import { getSessionOrg } from '@/lib/auth';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { FeedbackForm } from './feedback-form';

export const metadata = { title: 'Feedback · ChatManta' };
export const dynamic = 'force-dynamic';

export default async function V1FeedbackPage() {
  let initialEmail = '';
  try {
    const { user } = await getSessionOrg();
    initialEmail = user.email ?? '';
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      // Lid van geen org — laat het formulier leeg renderen (auth check in action).
    } else {
      throw e; // NEXT_REDIRECT → /v1/login
    }
  }

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
        <FeedbackForm initialEmail={initialEmail} />
      </Card>
    </>
  );
}
