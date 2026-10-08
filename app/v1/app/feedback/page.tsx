// V1 klant-feedback pagina.
// Auth: getSessionOrg (redirect naar /v1/login bij geen sessie).
// Voorvullen: e-mail uit sessie; naam leeg (V1 heeft geen contactPerson-override).

import { isAppError } from '@/lib/errors/app-error';
import { getSessionOrg } from '@/lib/auth';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { FeedbackForm } from './feedback-form';
import './feedback.css';

export const metadata = { title: 'Feedback · ChatManta' };
export const dynamic = 'force-dynamic';

export default async function V1FeedbackPage() {
  let initialEmail = '';
  try {
    const { user } = await getSessionOrg();
    initialEmail = user.email ?? '';
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      // Lid van geen org: laat het formulier leeg renderen (auth check in action).
    } else {
      throw e; // NEXT_REDIRECT → /v1/login
    }
  }

  return (
    <div className="v1-page v1-fb-page">
      <PageHeader
        title="Feedback geven"
        description="Een fout, een idee of een verkeerd antwoord van je chatbot? Laat het ons weten."
      />
      <div className="v1-card">
        <FeedbackForm initialEmail={initialEmail} />
      </div>
    </div>
  );
}
