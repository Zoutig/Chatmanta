'use server';

// Chat server action — thin wrapper around lib/v0/server/rag.ts.
// Exposed to client via 'use server'; called from <ChatBox /> client component.
//
// Auth: relies on proxy.ts to gate page access. Server actions are invoked
// from authenticated client sessions only — proxy already redirected
// unauthenticated requests to /login. Defense in depth would add an explicit
// cookie check here too; V0 demo accepts proxy alone.

import { runRagQuery, type ChatResponse } from '@/lib/v0/server/rag';
import { resolveBot } from '@/lib/v0/server/bots';
import { logQuery } from '@/lib/v0/server/log';

export async function askQuestion(input: {
  question: string;
  threshold: number;
  enableRewrite: boolean;
  version: string;
}): Promise<ChatResponse> {
  const bot = resolveBot(input.version);
  const response = await runRagQuery({
    question: input.question,
    threshold: input.threshold,
    enableRewrite: input.enableRewrite,
    bot,
  });
  // Fire-and-forget logging — never blocks the user response on a log write.
  logQuery(input.question, response).catch(() => undefined);
  return response;
}
