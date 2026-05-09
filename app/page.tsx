// V0 demo home — chat UI + sources panel + threshold slider + ingest +
// doc-list + bot version switcher.

import { ChatBox } from './components/chat-box';
import { DocList } from './components/doc-list';
import { IngestForm } from './components/ingest-form';
import { VersionSwitcher } from './components/version-switcher';
import { listDocs } from '@/lib/v0/server/rag';
import { BOT_VERSIONS_ORDERED, BOTS, resolveBot } from '@/lib/v0/server/bots';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const bot = resolveBot(v);
  const docs = await listDocs();

  // Strip server-only fields (long prompts) before passing to client.
  const allBots = BOT_VERSIONS_ORDERED.map((vKey) => {
    const b = BOTS[vKey];
    return { version: b.version, label: b.label, description: b.description };
  });

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ChatManta V0</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            RAG demo · OpenAI text-embedding-3-small + {bot.chatModel}
          </p>
        </div>
        <VersionSwitcher current={bot.version} bots={allBots} />
      </header>

      <ChatBox
        key={bot.version}
        botVersion={bot.version}
        defaultThreshold={bot.similarityThreshold}
        defaultEnableRewrite={bot.enableRewriteByDefault}
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <IngestForm />
        <DocList docs={docs} />
      </section>
    </main>
  );
}
