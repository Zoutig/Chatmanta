// V0 demo home — chat UI + sources panel + threshold slider + ingest + doc-list.

import { ChatBox } from './components/chat-box';
import { DocList } from './components/doc-list';
import { IngestForm } from './components/ingest-form';
import { listDocs, V0_RAG_DEFAULTS } from '@/lib/v0/server/rag';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const docs = await listDocs();

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ChatManta V0</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            RAG demo · OpenAI text-embedding-3-small + gpt-4o-mini
          </p>
        </div>
      </header>

      <ChatBox
        defaultThreshold={V0_RAG_DEFAULTS.SIMILARITY_THRESHOLD}
        defaultEnableRewrite={V0_RAG_DEFAULTS.ENABLE_REWRITE_BY_DEFAULT}
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <IngestForm />
        <DocList docs={docs} />
      </section>
    </main>
  );
}
