import { ClipboardList } from 'lucide-react';
import { ComingSoon } from '../components/coming-soon';

export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Onboarding</h1>
          <p className="klant-page-sub">
            Alle klanten in onboarding: fase, eigenaar, volgende actie en geblokkeerde stappen.
          </p>
        </div>
      </header>
      <ComingSoon title="Onboarding-overzicht volgt in Stap 4" icon={<ClipboardList size={24} strokeWidth={1.6} />} />
    </>
  );
}
