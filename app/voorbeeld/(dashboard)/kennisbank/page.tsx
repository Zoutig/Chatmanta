// Voorbeeld-dashboard: Kennisbank (Documenten / Website / Q&A). Zelfde opbouw als
// V1; alle tab-data komt uit vaste voorbeelddata. De actieve tab komt uit ?tab=
// en wordt client-side gewisseld (kennisbank-view.tsx).

import { DEMO_DOCUMENTS, DEMO_QA_ITEMS, getDemoWebsiteSources } from '@/lib/voorbeeld/fixtures/kennisbank';
import { KennisbankView } from './kennisbank-view';
import { parseKbTab } from './kb-tab';
import './kennisbank.css';

export default async function VoorbeeldKennisbankPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; prefillQuestion?: string }>;
}) {
  const { tab, prefillQuestion } = await searchParams;
  // Een prefill-link (correctieloop) impliceert de Q&A-tab, zodat het formulier opent.
  const activeTab = prefillQuestion ? 'qa' : parseKbTab(tab) ?? 'documenten';

  return (
    <KennisbankView
      initialTab={activeTab}
      initialDocs={DEMO_DOCUMENTS}
      initialSources={getDemoWebsiteSources()}
      initialQA={DEMO_QA_ITEMS}
      prefillQuestion={prefillQuestion}
      quizOpen
    />
  );
}
