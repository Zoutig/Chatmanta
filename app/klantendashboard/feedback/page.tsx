// Klantendashboard — Feedback / melding indienen. De klant vult een
// gestructureerde melding in; de operator (Niels) beheert hem in het Admin
// Dashboard. De status is bewust NIET zichtbaar voor de klant.

import { Card } from '../components/ui/card';
import { FeedbackForm } from './components/feedback-form';

export const metadata = { title: 'Feedback · ChatManta' };

export default function FeedbackPage() {
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
        <FeedbackForm />
      </Card>
    </>
  );
}
