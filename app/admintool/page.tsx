// V0 admin-tool — full-bleed chat shell met sidebar, conversation, en right panel.
// Route: /admintool (Phase 2 — verplaatst vanaf root `/` mei 2026; root is nu
// een redirect-stub naar /home, de centrale hub).

import { ChatShell } from '../components/chat-shell';
import { listDocs } from '@/lib/v0/server/rag';
import { listThreads } from '@/lib/v0/server/threads';
import { getAllTimeUsage } from '@/lib/v0/server/log';
import { BOT_VERSIONS_ORDERED, BOTS, resolveBot } from '@/lib/v0/server/bots';
import { getActiveOrgFromCookies, listKnownOrgs } from '@/lib/v0/server/active-org';
import { getExamplesForOrg } from '@/lib/v0/server/empty-state-examples';
import { getPersonaBySlug, renderPersonaTemplate } from '@/lib/v0/server/persona';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const bot = resolveBot(v);

  // v0.4 multi-org: lees active-org cookie hier zodat alle data-fetches
  // gescoped zijn op één org. Switchen via de sidebar-popover triggert
  // revalidatePath('/'), waardoor deze re-evaluatie plaatsvindt met
  // verse data uit de nieuwe org.
  const activeOrg = await getActiveOrgFromCookies();
  const orgs = listKnownOrgs();
  const examples = getExamplesForOrg(activeOrg.slug);
  // Persona-rendered systemPrompt voor de Prompt-tab live preview. De server-
  // side LLM-pipeline (runRagQueryStreaming) doet dezelfde render, dus de
  // preview kan niet driften van wat de bot daadwerkelijk te zien krijgt.
  const persona = getPersonaBySlug(activeOrg.slug);
  const renderedBotSystemPrompt = renderPersonaTemplate(bot.systemPrompt, persona);

  const [docs, threads, allTimeUsage] = await Promise.all([
    listDocs(activeOrg.id),
    listThreads(activeOrg.id),
    getAllTimeUsage(activeOrg.id),
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
      key={`${bot.version}-${activeOrg.slug}`}
      botVersion={bot.version}
      bots={allBots}
      botFlags={{
        cacheEnabled: bot.cacheEnabled,
        selfReflect: bot.selfReflect,
        cascadeOnLowConfidence: bot.cascadeOnLowConfidence,
        cascadeModel: bot.cascadeModel,
        generalKnowledgeEnabled: bot.generalKnowledgeEnabled,
      }}
      botSystemPrompt={renderedBotSystemPrompt}
      defaultThreshold={bot.similarityThreshold}
      defaultEnableRewrite={bot.enableRewriteByDefault}
      docs={docs}
      totalChunks={totalChunks}
      initialThreads={threads}
      initialAllTimeUsage={allTimeUsage}
      activeOrgSlug={activeOrg.slug}
      activeOrgId={activeOrg.id}
      availableOrgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
      examples={examples}
    />
  );
}
