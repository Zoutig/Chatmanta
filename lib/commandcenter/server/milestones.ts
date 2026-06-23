// Command Center milestones + phase-status storage.
// Pattern matches storage.ts (lokale sb() singleton, geen RLS, internal-only).

import 'server-only';

import {
  MILESTONE_DEFAULTS,
  ROADMAP_PHASES,
  type Milestone,
  type MilestoneInput,
  type MilestonePatch,
  type RoadmapPhase,
} from '../types';
import { getPhaseInfo, type PhaseStatus } from '../roadmap-phases';
import { SEED_MILESTONES } from '../seed-milestones';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

// ---------------------------------------------------------------------------
// Milestone CRUD
// ---------------------------------------------------------------------------

type MilestoneRow = {
  id: string;
  title: string;
  description: string | null;
  roadmap_phase: string;
  owner: string;
  status: string;
  deadline: string | null;
  acceptance_criteria: string[] | null;
  linked_task_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

function rowToMilestone(r: MilestoneRow): Milestone {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    roadmapPhase: r.roadmap_phase as Milestone['roadmapPhase'],
    owner: r.owner as Milestone['owner'],
    status: r.status as Milestone['status'],
    deadline: r.deadline,
    acceptanceCriteria: r.acceptance_criteria ?? [],
    linkedTaskIds: r.linked_task_ids ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function inputToRow(input: MilestoneInput) {
  return {
    title: input.title,
    description: input.description ?? null,
    roadmap_phase: input.roadmapPhase ?? MILESTONE_DEFAULTS.roadmapPhase,
    owner: input.owner ?? MILESTONE_DEFAULTS.owner,
    status: input.status ?? MILESTONE_DEFAULTS.status,
    deadline: input.deadline ?? null,
    acceptance_criteria: input.acceptanceCriteria ?? [],
    linked_task_ids: input.linkedTaskIds ?? [],
  };
}

function patchToRow(patch: MilestonePatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.roadmapPhase !== undefined) row.roadmap_phase = patch.roadmapPhase;
  if (patch.owner !== undefined) row.owner = patch.owner;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.deadline !== undefined) row.deadline = patch.deadline;
  if (patch.acceptanceCriteria !== undefined)
    row.acceptance_criteria = patch.acceptanceCriteria;
  if (patch.linkedTaskIds !== undefined) row.linked_task_ids = patch.linkedTaskIds;
  return row;
}

export async function listMilestones(): Promise<Milestone[]> {
  const { data, error } = await getServiceRoleClient()
    .from('cc_milestones')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listMilestones failed: ${error.message}`);
  return (data ?? []).map((r) => rowToMilestone(r as MilestoneRow));
}

export async function getMilestone(id: string): Promise<Milestone | null> {
  const { data, error } = await getServiceRoleClient()
    .from('cc_milestones')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getMilestone failed: ${error.message}`);
  return data ? rowToMilestone(data as MilestoneRow) : null;
}

export async function createMilestone(input: MilestoneInput): Promise<Milestone> {
  const { data, error } = await getServiceRoleClient()
    .from('cc_milestones')
    .insert(inputToRow(input))
    .select('*')
    .single();
  if (error) throw new Error(`createMilestone failed: ${error.message}`);
  return rowToMilestone(data as MilestoneRow);
}

export async function updateMilestone(
  id: string,
  patch: MilestonePatch,
): Promise<Milestone> {
  const row = patchToRow(patch);
  if (Object.keys(row).length === 0) {
    const existing = await getMilestone(id);
    if (!existing) throw new Error(`updateMilestone: ${id} not found`);
    return existing;
  }
  const { data, error } = await getServiceRoleClient()
    .from('cc_milestones')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateMilestone failed: ${error.message}`);
  return rowToMilestone(data as MilestoneRow);
}

export async function deleteMilestone(id: string): Promise<void> {
  const { error } = await getServiceRoleClient().from('cc_milestones').delete().eq('id', id);
  if (error) throw new Error(`deleteMilestone failed: ${error.message}`);
}

// Module-level cache: skip de COUNT(*) RTT zodra we weten dat seed gedaan is.
// Auto-seed is opt-in (CC_ENABLE_SEED=true) — zie ensureSeeded() in storage.ts:
// anders her-injecteert een cold-start de demo-milestones na de "schone lei".
let _milestonesSeeded = false;

export async function ensureMilestonesSeeded(): Promise<{ seeded: boolean; count: number }> {
  if (process.env.CC_ENABLE_SEED !== 'true') return { seeded: false, count: -1 };
  if (_milestonesSeeded) return { seeded: false, count: -1 };

  const { count, error } = await getServiceRoleClient()
    .from('cc_milestones')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`ensureMilestonesSeeded count failed: ${error.message}`);
  if ((count ?? 0) > 0) {
    _milestonesSeeded = true;
    return { seeded: false, count: count ?? 0 };
  }

  const rows = SEED_MILESTONES.map((m) => inputToRow(m));
  const { error: insertErr, count: inserted } = await getServiceRoleClient()
    .from('cc_milestones')
    .insert(rows, { count: 'exact' });
  if (insertErr)
    throw new Error(`ensureMilestonesSeeded insert failed: ${insertErr.message}`);
  _milestonesSeeded = true;
  return { seeded: true, count: inserted ?? rows.length };
}

// ---------------------------------------------------------------------------
// Phase-status (cc_phase_status) — upsert-only, default uit PHASE_INFO.
// ---------------------------------------------------------------------------

type PhaseStatusRow = { phase: string; status: string; updated_at: string };

export type PhaseStatusEntry = {
  phase: RoadmapPhase;
  status: PhaseStatus;
  updatedAt: string;
};

export async function listPhaseStatus(): Promise<PhaseStatusEntry[]> {
  const { data, error } = await getServiceRoleClient()
    .from('cc_phase_status')
    .select('phase, status, updated_at');
  if (error) throw new Error(`listPhaseStatus failed: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as PhaseStatusRow;
    return {
      phase: row.phase as RoadmapPhase,
      status: row.status as PhaseStatus,
      updatedAt: row.updated_at,
    };
  });
}

/** Voor elke RoadmapPhase de huidige status. Combineert DB-overrides met
 *  defaults uit PHASE_INFO zodat de UI altijd een waarde heeft. */
export async function resolvePhaseStatuses(): Promise<Record<RoadmapPhase, PhaseStatus>> {
  const stored = await listPhaseStatus();
  const map: Partial<Record<RoadmapPhase, PhaseStatus>> = {};
  for (const s of stored) map[s.phase] = s.status;
  const out: Record<string, PhaseStatus> = {};
  for (const phase of ROADMAP_PHASES) {
    out[phase] = map[phase] ?? getPhaseInfo(phase).defaultStatus;
  }
  return out as Record<RoadmapPhase, PhaseStatus>;
}

export async function setPhaseStatus(
  phase: RoadmapPhase,
  status: PhaseStatus,
): Promise<void> {
  const { error } = await getServiceRoleClient()
    .from('cc_phase_status')
    .upsert({ phase, status }, { onConflict: 'phase' });
  if (error) throw new Error(`setPhaseStatus failed: ${error.message}`);
}
