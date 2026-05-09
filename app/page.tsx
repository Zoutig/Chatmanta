// V0 demo home — full-bleed chat shell met sidebar, conversation, en right panel.

import { ChatShell } from './components/chat-shell';
import { listDocs } from '@/lib/v0/server/rag';
import { listThreads } from '@/lib/v0/server/threads';
import { getAllTimeUsage } from '@/lib/v0/server/log';
import { BOT_VERSIONS_ORDERED, BOTS, resolveBot } from '@/lib/v0/server/bots';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const bot = resolveBot(v);
  const [docs, threads, allTimeUsage] = await Promise.all([
    listDocs(),
    listThreads(),
    getAllTimeUsage(),
  ]);
  const totalChunks = docs.reduce((a, d) => a + d.chunkCount, 0);

  // Server-only velden (system prompts) wegstrippen voor de client.
  const allBots = BOT_VERSIONS_ORDERED.map((vKey) => {
    const b = BOTS[vKey];
    return {
      version: b.version,
      label: b.label,
      description: b.description,
      chatModel: b.chatModel,
    };
  });

  return (
    <ChatShell
      key={bot.version}
      botVersion={bot.version}
      bots={allBots}
      botFlags={{
        cacheEnabled: bot.cacheEnabled,
        selfReflect: bot.selfReflect,
        cascadeOnLowConfidence: bot.cascadeOnLowConfidence,
        cascadeModel: bot.cascadeModel,
      }}
      defaultThreshold={bot.similarityThreshold}
      defaultEnableRewrite={bot.enableRewriteByDefault}
      docs={docs}
      totalChunks={totalChunks}
      initialThreads={threads}
      initialAllTimeUsage={allTimeUsage}
    />
  );
}
