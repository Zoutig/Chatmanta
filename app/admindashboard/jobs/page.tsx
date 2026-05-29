import { Workflow } from 'lucide-react';
import { ComingSoon } from '../components/coming-soon';

export const dynamic = 'force-dynamic';

export default function JobsPage() {
  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Crawls &amp; Jobs</h1>
          <p className="klant-page-sub">
            Lopende, gefaalde en geslaagde crawl- en verwerkingsjobs over alle klanten.
          </p>
        </div>
      </header>
      <ComingSoon title="Jobs-overzicht volgt in Stap 2" icon={<Workflow size={24} strokeWidth={1.6} />} />
    </>
  );
}
