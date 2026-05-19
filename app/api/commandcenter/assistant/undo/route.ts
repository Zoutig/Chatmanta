// POST /api/commandcenter/assistant/undo — ongedaan-maken van een tool-mutatie.
//
// Body: { undo_token: string } — token = cc_assistant_messages.id van de
// tool-message met beforeState.
//
// Server-side window van 30s (UI toont 10s, ruimte voor klik-latency en
// re-renders).

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { requireV0Auth } from '@/app/actions/_auth';
import {
  getMessage,
  markMessageUndone,
} from '@/lib/commandcenter/server/assistant-threads';
import {
  createTask,
  deleteTask,
  getTask,
  updateTask,
} from '@/lib/commandcenter/server/storage';
import { deleteCheckIn } from '@/lib/commandcenter/server/checkins';
import { deleteDecision } from '@/lib/commandcenter/server/decisions';
import type { TaskInput, TaskPatch } from '@/lib/commandcenter/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UNDO_WINDOW_MS = 30_000;

export async function POST(req: NextRequest) {
  try {
    await requireV0Auth();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { undo_token?: string };
  try {
    body = (await req.json()) as { undo_token?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const id = body.undo_token?.trim();
  if (!id) {
    return NextResponse.json({ error: 'undo_token is required' }, { status: 400 });
  }

  const msg = await getMessage(id);
  if (!msg || msg.role !== 'tool') {
    return NextResponse.json({ error: 'tool message niet gevonden' }, { status: 404 });
  }
  if (msg.toolResult?.undone) {
    return NextResponse.json({ error: 'al ongedaan gemaakt' }, { status: 409 });
  }
  if (!msg.toolResult?.ok || msg.toolResult.beforeState === undefined) {
    return NextResponse.json(
      { error: 'tool-result heeft geen beforeState — niet undoable' },
      { status: 422 },
    );
  }

  // 30s server-side window
  const ageMs = Date.now() - new Date(msg.createdAt).getTime();
  if (ageMs > UNDO_WINDOW_MS) {
    return NextResponse.json(
      { error: `undo-window verstreken (${Math.round(ageMs / 1000)}s > 30s)` },
      { status: 410 },
    );
  }

  const toolName = msg.toolName ?? '';
  const before = msg.toolResult.beforeState as Record<string, unknown>;

  try {
    let restored: unknown = null;

    switch (toolName) {
      case 'create_task': {
        const createdId = String(before.id ?? '');
        if (!createdId) throw new Error('create_task undo: id ontbreekt in beforeState');
        // Check of taak nog bestaat (kan al door iemand verwijderd zijn)
        const existing = await getTask(createdId);
        if (existing) {
          await deleteTask(createdId);
        }
        restored = { id: createdId, action: 'deleted' };
        break;
      }
      case 'update_task':
      case 'complete_task': {
        // beforeState is een TaskInput-snapshot van vóór de mutatie. We hebben
        // de id niet expliciet meegeschreven, dus we leiden hem af uit het
        // item dat na de mutatie is opgeslagen (msg.toolResult.item.id).
        const itemAfter = msg.toolResult.item as { id?: string } | undefined;
        const taskId = itemAfter?.id;
        if (!taskId) throw new Error(`${toolName} undo: task id niet in tool_result.item`);
        const stillThere = await getTask(taskId);
        if (!stillThere) {
          throw new Error(`Taak ${taskId} bestaat niet meer — kan niet terugdraaien.`);
        }
        const patch = beforeStateToPatch(before);
        restored = await updateTask(taskId, patch);
        break;
      }
      case 'delete_task': {
        // beforeState is volledige TaskInput-snapshot. Recreate met nieuwe id.
        const input = before as TaskInput;
        restored = await createTask(input);
        break;
      }
      case 'create_checkin': {
        const createdId = String(before.id ?? '');
        if (!createdId) throw new Error('create_checkin undo: id ontbreekt');
        await deleteCheckIn(createdId);
        restored = { id: createdId, action: 'deleted' };
        break;
      }
      case 'create_decision': {
        const createdId = String(before.id ?? '');
        if (!createdId) throw new Error('create_decision undo: id ontbreekt');
        await deleteDecision(createdId);
        restored = { id: createdId, action: 'deleted' };
        break;
      }
      default:
        return NextResponse.json(
          { error: `tool ${toolName} is niet undoable` },
          { status: 422 },
        );
    }

    await markMessageUndone(id);

    return NextResponse.json({ ok: true, tool: toolName, restored });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cc-assistant/undo]', toolName, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converteer een TaskInput-snapshot terug naar een TaskPatch (alle velden). */
function beforeStateToPatch(before: Record<string, unknown>): TaskPatch {
  const patch: TaskPatch = {};
  if ('title' in before) patch.title = before.title as string;
  if ('description' in before) patch.description = before.description as string | null;
  if ('projectArea' in before) patch.projectArea = before.projectArea as TaskPatch['projectArea'];
  if ('roadmapPhase' in before) patch.roadmapPhase = before.roadmapPhase as TaskPatch['roadmapPhase'];
  if ('owner' in before) patch.owner = before.owner as TaskPatch['owner'];
  if ('status' in before) patch.status = before.status as TaskPatch['status'];
  if ('priority' in before) patch.priority = before.priority as TaskPatch['priority'];
  if ('deadline' in before) patch.deadline = before.deadline as string | null;
  if ('impact' in before) patch.impact = before.impact as TaskPatch['impact'];
  if ('effort' in before) patch.effort = before.effort as TaskPatch['effort'];
  if ('blockerReason' in before) patch.blockerReason = before.blockerReason as string | null;
  if ('nextAction' in before) patch.nextAction = before.nextAction as string | null;
  if ('labels' in before) patch.labels = before.labels as string[];
  return patch;
}
