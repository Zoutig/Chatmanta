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
import {
  createCheckIn,
  deleteCheckIn,
  updateCheckIn,
} from '@/lib/commandcenter/server/checkins';
import {
  createDecision,
  deleteDecision,
  ensureDecisionsSeeded,
  updateDecision,
} from '@/lib/commandcenter/server/decisions';
import {
  createCustomer,
  deleteCustomer,
  ensureCustomersSeeded,
  updateCustomer,
} from '@/lib/commandcenter/server/customers';
import type {
  CheckIn,
  CheckInInput,
  CheckInPatch,
  Decision,
  DecisionInput,
  DecisionPatch,
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
  TestCustomer,
  TestCustomerInput,
  TestCustomerPatch,
} from '@/lib/commandcenter/types';
import type { PhaseStatus } from '@/lib/commandcenter/roadmap-phases';
import { requireV0Auth } from './_auth';
import { actionTry, type ActionResult } from '@/lib/errors/action';

function revalidate() {
  revalidatePath('/commandcenter');
  revalidatePath('/commandcenter/tasks');
  revalidatePath('/commandcenter/roadmap');
  revalidatePath('/commandcenter/milestones');
  revalidatePath('/commandcenter/checkins');
  revalidatePath('/commandcenter/decisions');
  revalidatePath('/commandcenter/customers');
  revalidatePath('/commandcenter/projects');
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

// ---------------------------------------------------------------------------
// CheckIns (PR 3)
// ---------------------------------------------------------------------------

export async function createCheckInAction(
  input: CheckInInput,
): Promise<ActionResult<{ checkIn: CheckIn }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const checkIn = await createCheckIn(input);
    revalidate();
    return { checkIn };
  });
}

export async function updateCheckInAction(
  id: string,
  patch: CheckInPatch,
): Promise<ActionResult<{ checkIn: CheckIn }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const checkIn = await updateCheckIn(id, patch);
    revalidate();
    return { checkIn };
  });
}

export async function deleteCheckInAction(id: string): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    await deleteCheckIn(id);
    revalidate();
    return {};
  });
}

// ---------------------------------------------------------------------------
// Decisions (PR 3)
// ---------------------------------------------------------------------------

export async function createDecisionAction(
  input: DecisionInput,
): Promise<ActionResult<{ decision: Decision }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const decision = await createDecision(input);
    revalidate();
    return { decision };
  });
}

export async function updateDecisionAction(
  id: string,
  patch: DecisionPatch,
): Promise<ActionResult<{ decision: Decision }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const decision = await updateDecision(id, patch);
    revalidate();
    return { decision };
  });
}

export async function deleteDecisionAction(id: string): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    await deleteDecision(id);
    revalidate();
    return {};
  });
}

export async function ensureDecisionsSeededAction(): Promise<
  ActionResult<{ seeded: boolean; count: number }>
> {
  return actionTry(async () => {
    await requireV0Auth();
    const result = await ensureDecisionsSeeded();
    if (result.seeded) revalidate();
    return result;
  });
}

// ---------------------------------------------------------------------------
// Test customers (PR 3)
// ---------------------------------------------------------------------------

export async function createCustomerAction(
  input: TestCustomerInput,
): Promise<ActionResult<{ customer: TestCustomer }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const customer = await createCustomer(input);
    revalidate();
    return { customer };
  });
}

export async function updateCustomerAction(
  id: string,
  patch: TestCustomerPatch,
): Promise<ActionResult<{ customer: TestCustomer }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const customer = await updateCustomer(id, patch);
    revalidate();
    return { customer };
  });
}

export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    await deleteCustomer(id);
    revalidate();
    return {};
  });
}

export async function ensureCustomersSeededAction(): Promise<
  ActionResult<{ seeded: boolean; count: number }>
> {
  return actionTry(async () => {
    await requireV0Auth();
    const result = await ensureCustomersSeeded();
    if (result.seeded) revalidate();
    return result;
  });
}
