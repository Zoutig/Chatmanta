import { AlertTriangle } from 'lucide-react';
import { ComingSoon } from '../components/coming-soon';

export const dynamic = 'force-dynamic';

export default function IssuesPage() {
  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Issues</h1>
          <p className="klant-page-sub">
            Afgeleide errors uit gefaalde jobs, geblokkeerde queries en hoge fallback.
          </p>
        </div>
      </header>
      <ComingSoon title="Issues-overzicht volgt in Stap 3" icon={<AlertTriangle size={24} strokeWidth={1.6} />} />
    </>
  );
}
