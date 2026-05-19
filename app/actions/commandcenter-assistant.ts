'use server';

// Server actions voor Command Center Assistant — thread-beheer vanuit de
// client (paneel-UI). De turn-handler zelf is een POST-route
// (/api/commandcenter/assistant/route.ts), omdat hij streamt en
// server-actions niet goed gestreamde NDJSON kunnen retourneren.

import { revalidatePath } from 'next/cache';
import { requireV0Auth } from './_auth';
import { actionTry, type ActionResult } from '@/lib/errors/action';
import {
  archiveThread,
  deleteThread,
  listMessages,
  listThreads,
  renameThread,
} from '@/lib/commandcenter/server/assistant-threads';
import type { AssistantMessage, AssistantThread } from '@/lib/commandcenter/types';

function revalidate() {
  revalidatePath('/commandcenter');
}

export async function listThreadsAction(): Promise<
  ActionResult<{ threads: AssistantThread[] }>
> {
  return actionTry(async () => {
    await requireV0Auth();
    const threads = await listThreads();
    return { threads };
  });
}

export async function listThreadMessagesAction(
  threadId: string,
): Promise<ActionResult<{ messages: AssistantMessage[] }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const messages = await listMessages(threadId);
    return { messages };
  });
}

export async function renameThreadAction(
  id: string,
  title: string,
): Promise<ActionResult<{ thread: AssistantThread }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const thread = await renameThread(id, title);
    revalidate();
    return { thread };
  });
}

export async function archiveThreadAction(
  id: string,
): Promise<ActionResult<{ archived: true }>> {
  return actionTry(async () => {
    await requireV0Auth();
    await archiveThread(id);
    revalidate();
    return { archived: true as const };
  });
}

export async function deleteThreadAction(
  id: string,
): Promise<ActionResult<{ deleted: true }>> {
  return actionTry(async () => {
    await requireV0Auth();
    await deleteThread(id);
    revalidate();
    return { deleted: true as const };
  });
}
