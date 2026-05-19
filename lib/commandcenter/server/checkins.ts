// Command Center check-ins storage — wekelijkse retros (goal-prompt §12).
// Service-role only, geen RLS — internal cockpit data.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CheckIn, CheckInInput, CheckInPatch } from '../types';

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('CheckIns storage requires Supabase env vars');
  }
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

type CheckInRow = {
  id: string;
  week_label: string;
  date: string;
  attendees: string[] | null;
  completed: string;
  not_completed: string;
  reasons: string;
  sebastiaan_next_tasks: string[] | null;
  niels_next_tasks: string[] | null;
  shared_next_tasks: string[] | null;
  next_priorities: string[] | null;
  blockers: string;
  decisions: string;
  created_task_ids: string[] | null;
  created_at: string;
};

function rowToCheckIn(r: CheckInRow): CheckIn {
  return {
    id: r.id,
    weekLabel: r.week_label,
    date: r.date,
    attendees: r.attendees ?? [],
    completed: r.completed ?? '',
    notCompleted: r.not_completed ?? '',
    reasons: r.reasons ?? '',
    sebastiaanNextTasks: r.sebastiaan_next_tasks ?? [],
    nielsNextTasks: r.niels_next_tasks ?? [],
    sharedNextTasks: r.shared_next_tasks ?? [],
    nextPriorities: r.next_priorities ?? [],
    blockers: r.blockers ?? '',
    decisions: r.decisions ?? '',
    createdTaskIds: r.created_task_ids ?? [],
    createdAt: r.created_at,
  };
}

function inputToRow(input: CheckInInput) {
  return {
    week_label: input.weekLabel,
    date: input.date,
    attendees: input.attendees ?? [],
    completed: input.completed ?? '',
    not_completed: input.notCompleted ?? '',
    reasons: input.reasons ?? '',
    sebastiaan_next_tasks: input.sebastiaanNextTasks ?? [],
    niels_next_tasks: input.nielsNextTasks ?? [],
    shared_next_tasks: input.sharedNextTasks ?? [],
    next_priorities: input.nextPriorities ?? [],
    blockers: input.blockers ?? '',
    decisions: input.decisions ?? '',
    created_task_ids: input.createdTaskIds ?? [],
  };
}

function patchToRow(patch: CheckInPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.weekLabel !== undefined) row.week_label = patch.weekLabel;
  if (patch.date !== undefined) row.date = patch.date;
  if (patch.attendees !== undefined) row.attendees = patch.attendees;
  if (patch.completed !== undefined) row.completed = patch.completed;
  if (patch.notCompleted !== undefined) row.not_completed = patch.notCompleted;
  if (patch.reasons !== undefined) row.reasons = patch.reasons;
  if (patch.sebastiaanNextTasks !== undefined)
    row.sebastiaan_next_tasks = patch.sebastiaanNextTasks;
  if (patch.nielsNextTasks !== undefined)
    row.niels_next_tasks = patch.nielsNextTasks;
  if (patch.sharedNextTasks !== undefined)
    row.shared_next_tasks = patch.sharedNextTasks;
  if (patch.nextPriorities !== undefined)
    row.next_priorities = patch.nextPriorities;
  if (patch.blockers !== undefined) row.blockers = patch.blockers;
  if (patch.decisions !== undefined) row.decisions = patch.decisions;
  if (patch.createdTaskIds !== undefined)
    row.created_task_ids = patch.createdTaskIds;
  return row;
}

export async function listCheckIns(): Promise<CheckIn[]> {
  const { data, error } = await sb()
    .from('cc_checkins')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw new Error(`listCheckIns failed: ${error.message}`);
  return (data ?? []).map((r) => rowToCheckIn(r as CheckInRow));
}

export async function getCheckIn(id: string): Promise<CheckIn | null> {
  const { data, error } = await sb()
    .from('cc_checkins')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getCheckIn failed: ${error.message}`);
  return data ? rowToCheckIn(data as CheckInRow) : null;
}

export async function createCheckIn(input: CheckInInput): Promise<CheckIn> {
  const { data, error } = await sb()
    .from('cc_checkins')
    .insert(inputToRow(input))
    .select('*')
    .single();
  if (error) throw new Error(`createCheckIn failed: ${error.message}`);
  return rowToCheckIn(data as CheckInRow);
}

export async function updateCheckIn(
  id: string,
  patch: CheckInPatch,
): Promise<CheckIn> {
  const row = patchToRow(patch);
  if (Object.keys(row).length === 0) {
    const existing = await getCheckIn(id);
    if (!existing) throw new Error(`updateCheckIn: ${id} not found`);
    return existing;
  }
  const { data, error } = await sb()
    .from('cc_checkins')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateCheckIn failed: ${error.message}`);
  return rowToCheckIn(data as CheckInRow);
}

export async function deleteCheckIn(id: string): Promise<void> {
  const { error } = await sb().from('cc_checkins').delete().eq('id', id);
  if (error) throw new Error(`deleteCheckIn failed: ${error.message}`);
}
