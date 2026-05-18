'use server';

// Command Center server actions — CRUD voor cc_tasks + cc_milestones +
// cc_phase_status.
//
// Auth: requireV0Auth() voor elke service-role-call (defense-in-depth boven
// proxy.ts). Zelfde patroon als app/actions/faq.ts.

import { revalidatePath } from 'next/cache';
import {
  createTask,
  deleteTask,
  ensureSeeded,
  listTasks,
  updateTask,
} from '@/lib/commandcenter/server/storage';
import {
  createMilestone,
  deleteMilestone,
  ensureMilestonesSeeded,
  setPhaseStatus,
  updateMilestone,
} from '@/lib/commandcenter/server/milestones';
import type {
  Milestone,
  MilestoneInput,
  MilestonePatch,
  Owner,
  Priority,
  RoadmapPhase,
  Task,
  TaskInput,
  TaskPatch,
  TaskStatus,
} from '@/lib/commandcenter/types';
import type { PhaseStatus } from '@/lib/commandcenter/roadmap-phases';
import { requireV0Auth } from './_auth';
import { actionTry, type ActionResult } from '@/lib/errors/action';

function revalidate() {
  revalidatePath('/commandcenter');
  revalidatePath('/commandcenter/tasks');
  revalidatePath('/commandcenter/roadmap');
  revalidatePath('/commandcenter/milestones');
}

export async function listTasksAction(): Promise<ActionResult<{ tasks: Task[] }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const tasks = await listTasks();
    return { tasks };
  });
}

export async function createTaskAction(
  input: TaskInput,
): Promise<ActionResult<{ task: Task }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const task = await createTask(input);
    revalidate();
    return { task };
  });
}

export async function updateTaskAction(
  id: string,
  patch: TaskPatch,
): Promise<ActionResult<{ task: Task }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const task = await updateTask(id, patch);
    revalidate();
    return { task };
  });
}

export async function deleteTaskAction(id: string): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    await deleteTask(id);
    revalidate();
    return {};
  });
}

export async function setStatusAction(
  id: string,
  status: TaskStatus,
): Promise<ActionResult<{ task: Task }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const task = await updateTask(id, { status });
    revalidate();
    return { task };
  });
}

export async function setOwnerAction(
  id: string,
  owner: Owner,
): Promise<ActionResult<{ task: Task }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const task = await updateTask(id, { owner });
    revalidate();
    return { task };
  });
}

export async function setPriorityAction(
  id: string,
  priority: Priority,
): Promise<ActionResult<{ task: Task }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const task = await updateTask(id, { priority });
    revalidate();
    return { task };
  });
}

export async function ensureSeededAction(): Promise<
  ActionResult<{ seeded: boolean; count: number }>
> {
  return actionTry(async () => {
    await requireV0Auth();
    const result = await ensureSeeded();
    if (result.seeded) revalidate();
    return result;
  });
}

// ---------------------------------------------------------------------------
// Milestones (PR 2)
// ---------------------------------------------------------------------------

export async function createMilestoneAction(
  input: MilestoneInput,
): Promise<ActionResult<{ milestone: Milestone }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const milestone = await createMilestone(input);
    revalidate();
    return { milestone };
  });
}

export async function updateMilestoneAction(
  id: string,
  patch: MilestonePatch,
): Promise<ActionResult<{ milestone: Milestone }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const milestone = await updateMilestone(id, patch);
    revalidate();
    return { milestone };
  });
}

export async function deleteMilestoneAction(id: string): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    await deleteMilestone(id);
    revalidate();
    return {};
  });
}

export async function ensureMilestonesSeededAction(): Promise<
  ActionResult<{ seeded: boolean; count: number }>
> {
  return actionTry(async () => {
    await requireV0Auth();
    const result = await ensureMilestonesSeeded();
    if (result.seeded) revalidate();
    return result;
  });
}

export async function setPhaseStatusAction(
  phase: RoadmapPhase,
  status: PhaseStatus,
): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    await setPhaseStatus(phase, status);
    revalidate();
    return {};
  });
}
