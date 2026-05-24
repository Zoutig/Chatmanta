// Command Center — Supabase storage layer.
//
// Pattern matches lib/v0/server/faq-snapshot.ts: lokale service-role singleton.
// Geen RLS op cc_* tabellen (zie migration 0025 header) — alle access loopt
// langs deze module, en de hele /commandcenter route is achter de V0 demo-
// password gate (proxy.ts + requireV0Auth() in actions).

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  TASK_DEFAULTS,
  type Task,
  type TaskInput,
  type TaskPatch,
} from '../types';
import { SEED_TASKS } from '../seed-data';

let _sb: SupabaseClient | null = null;

function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Command Center storage requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  project_area: string;
  roadmap_phase: string;
  owner: string;
  status: string;
  priority: string;
  deadline: string | null;
  impact: string;
  effort: string;
  blocker_reason: string | null;
  next_action: string | null;
  labels: string[] | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    projectArea: r.project_area as Task['projectArea'],
    roadmapPhase: r.roadmap_phase as Task['roadmapPhase'],
    owner: r.owner as Task['owner'],
    status: r.status as Task['status'],
    priority: r.priority as Task['priority'],
    deadline: r.deadline,
    impact: r.impact as Task['impact'],
    effort: r.effort as Task['effort'],
    blockerReason: r.blocker_reason,
    nextAction: r.next_action,
    labels: r.labels ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  };
}

function inputToRow(input: TaskInput) {
  const owner = input.owner ?? TASK_DEFAULTS.owner;
  const status = input.status ?? TASK_DEFAULTS.status;
  return {
    title: input.title,
    description: input.description ?? null,
    project_area: input.projectArea ?? TASK_DEFAULTS.projectArea,
    roadmap_phase: input.roadmapPhase ?? TASK_DEFAULTS.roadmapPhase,
    owner,
    status,
    priority: input.priority ?? TASK_DEFAULTS.priority,
    deadline: input.deadline ?? null,
    impact: input.impact ?? TASK_DEFAULTS.impact,
    effort: input.effort ?? TASK_DEFAULTS.effort,
    blocker_reason: input.blockerReason ?? null,
    next_action: input.nextAction ?? null,
    labels: input.labels ?? [],
    // completed_at wordt door trigger gevuld bij status=Klaar
  };
}

function patchToRow(patch: TaskPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.projectArea !== undefined) row.project_area = patch.projectArea;
  if (patch.roadmapPhase !== undefined) row.roadmap_phase = patch.roadmapPhase;
  if (patch.owner !== undefined) row.owner = patch.owner;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.deadline !== undefined) row.deadline = patch.deadline;
  if (patch.impact !== undefined) row.impact = patch.impact;
  if (patch.effort !== undefined) row.effort = patch.effort;
  if (patch.blockerReason !== undefined) row.blocker_reason = patch.blockerReason;
  if (patch.nextAction !== undefined) row.next_action = patch.nextAction;
  if (patch.labels !== undefined) row.labels = patch.labels;
  return row;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await sb()
    .from('cc_tasks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listTasks failed: ${error.message}`);
  return (data ?? []).map((r) => rowToTask(r as TaskRow));
}

export async function getTask(id: string): Promise<Task | null> {
  const { data, error } = await sb()
    .from('cc_tasks')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getTask failed: ${error.message}`);
  return data ? rowToTask(data as TaskRow) : null;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const row = inputToRow(input);
  const { data, error } = await sb()
    .from('cc_tasks')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`createTask failed: ${error.message}`);
  return rowToTask(data as TaskRow);
}

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  const row = patchToRow(patch);
  if (Object.keys(row).length === 0) {
    const existing = await getTask(id);
    if (!existing) throw new Error(`updateTask: task ${id} not found`);
    return existing;
  }
  const { data, error } = await sb()
    .from('cc_tasks')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateTask failed: ${error.message}`);
  return rowToTask(data as TaskRow);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await sb().from('cc_tasks').delete().eq('id', id);
  if (error) throw new Error(`deleteTask failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/** Idempotent: alleen seeden als de tabel leeg is.
 *  Module-level cache zodat we niet bij elke request een COUNT(*) RTT doen
 *  zodra we weten dat de tabel al gevuld is.
 *
 *  Auto-seed is opt-in (CC_ENABLE_SEED=true). Reden: deze functie draait op elke
 *  command-center page-load en her-injecteerde de demo-seed zodra de tabel leeg
 *  was. Dat ondermijnt de "schone lei"-actie — na het wissen van open taken zou
 *  een Vercel cold-start (in-memory cache reset) de seed terugzetten. Standaard
 *  dus niet seeden; zet de env-var alleen om een verse DB initieel te vullen. */
let _tasksSeeded = false;

export async function ensureSeeded(): Promise<{ seeded: boolean; count: number }> {
  if (process.env.CC_ENABLE_SEED !== 'true') return { seeded: false, count: -1 };
  if (_tasksSeeded) return { seeded: false, count: -1 };

  const { count, error } = await sb()
    .from('cc_tasks')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`ensureSeeded count failed: ${error.message}`);
  if ((count ?? 0) > 0) {
    _tasksSeeded = true;
    return { seeded: false, count: count ?? 0 };
  }

  const rows = SEED_TASKS.map((t) => inputToRow(t));
  const { error: insertErr, count: inserted } = await sb()
    .from('cc_tasks')
    .insert(rows, { count: 'exact' });
  if (insertErr) throw new Error(`ensureSeeded insert failed: ${insertErr.message}`);
  _tasksSeeded = true;
  return { seeded: true, count: inserted ?? rows.length };
}
