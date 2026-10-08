// V1 Kennisbank: Documenten / Website / Q&A (spec §7.4).
// Leest alle tab-data parallel (session-client, RLS); de actieve tab komt uit
// ?tab= en wordt client-side gewisseld (kennisbank-view.tsx).
// Auth-keten = /v1/app: geen sessie → redirect /v1/login; geen lid → "Geen toegang".

import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getActiveQuizForOrg } from '@/lib/v1/quiz/data';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { getOrgChatbot } from '../rag-config';
import { getWebsiteSources } from './crawl-data';
import { KennisbankView } from './kennisbank-view';
import { parseKbTab } from './kb-tab';
import type { UploadedDoc } from './v1-documents';
import './kennisbank.css';

export const dynamic = 'force-dynamic';

export default async function V1KennisbankPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; prefillQuestion?: string }>;
}) {
  const { tab, prefillQuestion } = await searchParams;
  // Een prefill-link (correctieloop) impliceert de Q&A-tab, zodat het formulier opent.
  const activeTab = prefillQuestion ? 'qa' : parseKbTab(tab) ?? 'documenten';

  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Je bent geen lid van deze organisatie." />;
    }
    throw e; // NEXT_REDIRECT → /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return <PageHeader title="Kennisbank" description="Er is nog geen chatbot ingesteld." />;
  }

  // Lees alle tab-data parallel (session-client, RLS).
  const [sourcesRes, docRows, chunkCounts, qaRows, activeQuiz] = await Promise.all([
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

    // Actieve kennisquiz (best-effort, nooit blokkeren); zelfde berekening als Overzicht.
    getActiveQuizForOrg(supabase, orgId).catch(() => null),
  ]);

  const quizOpen =
    activeQuiz?.status === 'actief' &&
    activeQuiz.questionCount - activeQuiz.answeredCount - activeQuiz.skippedCount > 0;

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

  return (
    <KennisbankView
      initialTab={activeTab}
      initialDocs={docs}
      initialSources={sourcesRes}
      initialQA={initialQA}
      prefillQuestion={prefillQuestion}
      quizOpen={quizOpen}
    />
  );
}
