import { Settings2 } from 'lucide-react';
import { ComingSoon } from '../components/coming-soon';

export const dynamic = 'force-dynamic';

export default function InstellingenPage() {
  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Instellingen</h1>
          <p className="klant-page-sub">
            Globale technische configuratie — read-only, secrets gemaskeerd.
          </p>
        </div>
      </header>
      <ComingSoon title="Globale instellingen volgen in Stap 3" icon={<Settings2 size={24} strokeWidth={1.6} />} />
    </>
  );
}
