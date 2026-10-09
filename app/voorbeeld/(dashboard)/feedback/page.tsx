// Voorbeeld-dashboard: feedbackpagina. Zelfde formulier als V1, e-mail voorgevuld
// met het voorbeeldaccount; insturen doet alsof.

import { PageHeader } from '@/app/v1/_ui/page-header';
import { DEMO_ACCOUNT } from '@/lib/voorbeeld/fixtures/account';
import { FeedbackForm } from './feedback-form';
import './feedback.css';

export const metadata = { title: 'Feedback · ChatManta' };

export default function VoorbeeldFeedbackPage() {
  return (
    <div className="v1-page v1-fb-page">
      <PageHeader
        title="Feedback geven"
        description="Een fout, een idee of een verkeerd antwoord van je chatbot? Laat het ons weten."
      />
      <div className="v1-card">
        <FeedbackForm initialEmail={DEMO_ACCOUNT.email} />
      </div>
    </div>
  );
}
