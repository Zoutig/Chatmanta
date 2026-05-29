import { Library } from 'lucide-react';
import { ComingSoon } from '../components/coming-soon';

export const dynamic = 'force-dynamic';

export default function BronnenPage() {
  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Bronnen</h1>
          <p className="klant-page-sub">
            Alle ingeladen content per klant: websites, documenten en Q&amp;A met status.
          </p>
        </div>
      </header>
      <ComingSoon title="Bronnen-overzicht volgt in Stap 2" icon={<Library size={24} strokeWidth={1.6} />} />
    </>
  );
}
