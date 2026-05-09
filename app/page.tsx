// V0 demo home — chat UI + sources panel + threshold slider.

import { ChatBox } from './components/chat-box';
import { V0_RAG_DEFAULTS } from '@/lib/v0/server/rag';

export const dynamic = 'force-dynamic';

export default function Home() {
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
      <ChatBox defaultThreshold={V0_RAG_DEFAULTS.SIMILARITY_THRESHOLD} />
    </main>
  );
}
