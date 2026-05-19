// V0 Klantendashboard — Scherm 2: Kennisbank.
//
// Eén pagina met 3 tabs: Documenten (echte data) / Website (mock) / Q&A (mock).
// Tab-state via ?tab=<key> in de URL — Next.js searchParams is server-only en
// rendert dus de juiste tab server-side, zonder client-flicker.

import { getActiveOrgFromCookies, KNOWN_ORGS } from '@/lib/v0/server/active-org';
import { listDocs } from '@/lib/v0/server/rag';
import { getMockWebsitePages } from '@/lib/v0/klantendashboard/mock/website-pages';
import { getMockManualQA } from '@/lib/v0/klantendashboard/mock/manual-qa';
import type { DocumentSummary } from '@/lib/v0/klantendashboard/types';
import { PageHeader } from '../components/page-header';
import { TabsNav } from '../components/tabs';
import { DocumentsTab } from './components/documents-tab';
import { WebsiteTab } from './components/website-tab';
import { QATab } from './components/qa-tab';

export const dynamic = 'force-dynamic';

function mapDocStatus(s: string): DocumentSummary['status'] {
  if (s === 'ready' || s === 'completed') return 'ready';
  if (s === 'failed' || s === 'error') return 'error';
  return 'processing';
}

function mapDocType(name: string): DocumentSummary['type'] {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt') return 'txt';
  return 'other';
}

export default async function KennisbankPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === 'website' || tab === 'qa' ? tab : 'documenten';

  const activeOrg = await getActiveOrgFromCookies();
  const orgId = KNOWN_ORGS[activeOrg.slug].id;

  const [rawDocs, mockWebsite, mockQA] = await Promise.all([
    listDocs(orgId).catch(() => []),
    Promise.resolve(getMockWebsitePages(activeOrg.slug)),
    Promise.resolve(getMockManualQA(activeOrg.slug)),
  ]);

  // Real DB docs naar UI-shape mappen.
  const docs: DocumentSummary[] = rawDocs.map((d) => ({
    id: d.id,
    name: d.filename,
    type: mapDocType(d.filename),
    size: 0, // listDocs geeft size niet terug — V1 verbetering
    status: mapDocStatus(d.status),
    lastProcessedAt: d.createdAt,
    chunkCount: d.chunkCount,
  }));

  return (
    <>
      <PageHeader
        title="Kennisbank"
        subtitle="Dit zijn de informatiebronnen van je chatbot. Hoe completer ze zijn, hoe beter de antwoorden."
      />

      <TabsNav
        basePath="/klantendashboard/kennisbank"
        active={activeTab}
        tabs={[
          { key: 'documenten', label: 'Documenten', count: docs.length },
          { key: 'website', label: 'Website', count: mockWebsite.length },
          { key: 'qa', label: 'Handmatige Q&A', count: mockQA.length },
        ]}
      />

      {activeTab === 'documenten' && <DocumentsTab initialDocs={docs} />}
      {activeTab === 'website' && <WebsiteTab initialPages={mockWebsite} />}
      {activeTab === 'qa' && <QATab initialQA={mockQA} />}
    </>
  );
}
