import { BarChart3 } from 'lucide-react';
import { ComingSoon } from '../components/coming-soon';

export const dynamic = 'force-dynamic';

export default function UsagePage() {
  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Usage &amp; Kosten</h1>
          <p className="klant-page-sub">
            Verbruik en geschatte kosten per klant, met limietstatus.
          </p>
        </div>
      </header>
      <ComingSoon title="Usage-overzicht volgt in Stap 3" icon={<BarChart3 size={24} strokeWidth={1.6} />} />
    </>
  );
}
