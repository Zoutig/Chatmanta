// V0 Klantendashboard — Scherm 2: Kennisbank.
//
// Eén pagina met 3 tabs: Documenten (echte data) / Website (mock) / Q&A (mock).
// Tab-state via ?tab=<key> in de URL — Next.js searchParams is server-only en
// rendert dus de juiste tab server-side, zonder client-flicker.

import { getActiveOrgFromCookies, KNOWN_ORGS } from '@/lib/v0/server/active-org';
import { listDocs } from '@/lib/v0/server/rag';
import { getMockWebsitePages } from '@/lib/v0/klantendashboard/mock/website-pages';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import type { DocumentSummary } from '@/lib/v0/klantendashboard/types';
import { PageHead } from '../components/ui/page-head';
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

  const [rawDocs, mockWebsite, settings] = await Promise.all([
    listDocs(orgId).catch(() => []),
    Promise.resolve(getMockWebsitePages(activeOrg.slug)),
    getOrgSettings(activeOrg.slug),
  ]);
  const qa = settings.qa;

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
      <PageHead
        eyebrow="Kennisbank"
        title="De bronnen waaruit je chatbot put"
        subtitle="Documenten, website en Q&A worden geïndexeerd en hergebruikt in elk antwoord. Een goede kennisbank is het verschil tussen 60% en 95% behulpzaamheid."
      />

      <TabsNav
        basePath="/klantendashboard/kennisbank"
        active={activeTab}
        tabs={[
          { key: 'documenten', label: 'Documenten', count: docs.length },
          { key: 'website', label: 'Website', count: mockWebsite.length },
          { key: 'qa', label: 'Handmatige Q&A', count: qa.length },
        ]}
      />

      {activeTab === 'documenten' && <DocumentsTab key={activeOrg.slug} initialDocs={docs} />}
      {activeTab === 'website' && <WebsiteTab key={activeOrg.slug} initialPages={mockWebsite} />}
      {activeTab === 'qa' && <QATab key={activeOrg.slug} initialQA={qa} />}
    </>
  );
}
