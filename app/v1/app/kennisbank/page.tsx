// V1 Kennisbank — 3 tabs: Documenten / Website / Q&A.
// Tab-state via ?tab= in de URL (server-side, geen client-flicker).
// Auth-keten = /v1/app: geen sessie → redirect /v1/login; geen lid → "Geen toegang".

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { TabsNav } from '@/app/klantendashboard/components/tabs';
import { getOrgChatbot } from '../rag-config';
import { getWebsiteSources } from './crawl-data';
import { WebsiteTab } from './components/website-tab';
import { V1Documents, type UploadedDoc } from './v1-documents';
import { QATab } from './qa/qa-tab';

export const dynamic = 'force-dynamic';

const BASE = '/v1/app/kennisbank';

export default async function V1KennisbankPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === 'website' || tab === 'qa' ? tab : 'documenten';

  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <PageHead eyebrow="Kennisbank" title="Geen toegang" subtitle="Je bent geen lid van deze organisatie." />
      );
    }
    throw e; // NEXT_REDIRECT → /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return (
      <PageHead
        eyebrow="Kennisbank"
        title="De bronnen waaruit je chatbot put"
        subtitle="Deze organisatie heeft nog geen chatbot geconfigureerd."
      />
    );
  }

  // Lees alle tab-data parallel (session-client, RLS).
  const [sourcesRes, docRows, chunkCounts, qaRows] = await Promise.all([
    getWebsiteSources(supabase, orgId, chatbot.id).catch(() => []),

    supabase
      .from('documents')
      .select('id, filename, status, created_at')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbot.id)
      .eq('source', 'upload')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => data ?? []),

    // Chunk-count per document (één query, gegroepeerd in JS).
    supabase
      .from('document_chunks')
      .select('document_id')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbot.id)
      .then(({ data }) => {
        const m = new Map<string, number>();
        for (const r of data ?? []) {
          const id = r.document_id as string;
          m.set(id, (m.get(id) ?? 0) + 1);
        }
        return m;
      }),

    supabase
      .from('org_qa_items')
      .select('id, question, answer, category, active, ingested_document_id')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbot.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => data ?? []),
  ]);

  const docs: UploadedDoc[] = docRows.map((d) => ({
    id: d.id as string,
    filename: (d.filename as string) ?? '(naamloos)',
    status: (d.status as string) ?? 'processing',
    createdAt: (d.created_at as string) ?? '',
    chunkCount: chunkCounts.get(d.id as string) ?? 0,
  }));

  const initialQA = qaRows.map((r) => ({
    id: r.id as string,
    question: r.question as string,
    answer: r.answer as string,
    category: (r.category as string | null) ?? null,
    active: (r.active as boolean) ?? true,
    ingestedDocumentId: (r.ingested_document_id as string | null) ?? null,
  }));

  const pageCount = sourcesRes.reduce((n, w) => n + w.pages.length, 0);

  return (
    <>
      <PageHead
        eyebrow="Kennisbank"
        title="De bronnen waaruit je chatbot put"
        subtitle="Documenten, website en Q&A worden geïndexeerd en hergebruikt in elk antwoord. Een goede kennisbank is het verschil tussen 60% en 95% behulpzaamheid."
      />

      <TabsNav
        basePath={BASE}
        active={activeTab}
        tabs={[
          { key: 'documenten', label: 'Documenten', count: docs.length },
          { key: 'website', label: 'Website', count: pageCount },
          { key: 'qa', label: 'Handmatige Q&A', count: initialQA.length },
        ]}
      />

      {activeTab === 'documenten' && <V1Documents initialDocs={docs} />}
      {activeTab === 'website' && <WebsiteTab initialSources={sourcesRes} />}
      {activeTab === 'qa' && (
        <QATab initialQA={initialQA} orgId={orgId} chatbotId={chatbot.id} />
      )}
    </>
  );
}
