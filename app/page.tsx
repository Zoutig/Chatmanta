// V0 demo home — chat UI + sources panel + threshold slider + ingest +
// doc-list + bot version switcher + theme switch.

import { ChatBox } from './components/chat-box';
import { DocList } from './components/doc-list';
import { IngestForm } from './components/ingest-form';
import { VersionSwitcher } from './components/version-switcher';
import { ThemeSwitch } from './components/theme-switch';
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
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            ChatManta
          </h1>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            RAG · {bot.version} · {bot.chatModel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <VersionSwitcher current={bot.version} bots={allBots} />
        </div>
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
