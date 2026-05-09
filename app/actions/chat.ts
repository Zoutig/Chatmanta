'use server';

// Chat server action — thin wrapper around lib/v0/server/rag.ts.
// Exposed to client via 'use server'; called from <ChatBox /> client component.
//
// Auth: relies on proxy.ts to gate page access. Server actions are invoked
// from authenticated client sessions only — proxy already redirected
// unauthenticated requests to /login. Defense in depth would add an explicit
// cookie check here too; V0 demo accepts proxy alone.

import { runRagQuery, type ChatResponse } from '@/lib/v0/server/rag';

export async function askQuestion(input: {
  question: string;
  threshold: number;
  enableRewrite: boolean;
}): Promise<ChatResponse> {
  return runRagQuery(input);
}
