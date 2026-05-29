import { MessagesSquare } from 'lucide-react';
import { ComingSoon } from '../components/coming-soon';

export const dynamic = 'force-dynamic';

export default function GesprekkenPage() {
  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Gesprekken</h1>
          <p className="klant-page-sub">
            Gesprekken over alle klanten, gefilterd op fallback, feedback en mogelijke PII.
          </p>
        </div>
      </header>
      <ComingSoon title="Gesprekken-overzicht volgt in Stap 2" icon={<MessagesSquare size={24} strokeWidth={1.6} />} />
    </>
  );
}
