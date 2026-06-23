// Command Center decisions log — service-role only, geen RLS.

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/admin';
import {
  DECISION_DEFAULTS,
  type Decision,
  type DecisionInput,
  type DecisionPatch,
} from '../types';
import { SEED_DECISIONS } from '../seed-decisions';

type DecisionRow = {
  id: string;
  date: string;
  title: string;
  decision: string;
  context: string | null;
  impact: string | null;
  decided_by: string[] | null;
  review_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function rowToDecision(r: DecisionRow): Decision {
  return {
    id: r.id,
    date: r.date,
    title: r.title,
    decision: r.decision ?? '',
    context: r.context,
    impact: (r.impact as Decision['impact']) ?? null,
    decidedBy: (r.decided_by ?? []) as Decision['decidedBy'],
    reviewDate: r.review_date,
    status: r.status as Decision['status'],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function inputToRow(input: DecisionInput) {
  return {
    date: input.date,
    title: input.title,
    decision: input.decision ?? '',
    context: input.context ?? null,
    impact: input.impact ?? null,
    decided_by: input.decidedBy ?? DECISION_DEFAULTS.decidedBy,
    review_date: input.reviewDate ?? null,
    status: input.status ?? DECISION_DEFAULTS.status,
  };
}

function patchToRow(patch: DecisionPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.date !== undefined) row.date = patch.date;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.decision !== undefined) row.decision = patch.decision;
  if (patch.context !== undefined) row.context = patch.context;
  if (patch.impact !== undefined) row.impact = patch.impact;
  if (patch.decidedBy !== undefined) row.decided_by = patch.decidedBy;
  if (patch.reviewDate !== undefined) row.review_date = patch.reviewDate;
  if (patch.status !== undefined) row.status = patch.status;
  return row;
}

export async function listDecisions(): Promise<Decision[]> {
  const { data, error } = await getServiceRoleClient()
    .from('cc_decisions')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw new Error(`listDecisions failed: ${error.message}`);
  return (data ?? []).map((r) => rowToDecision(r as DecisionRow));
}

export async function getDecision(id: string): Promise<Decision | null> {
  const { data, error } = await getServiceRoleClient()
    .from('cc_decisions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getDecision failed: ${error.message}`);
  return data ? rowToDecision(data as DecisionRow) : null;
}

export async function createDecision(input: DecisionInput): Promise<Decision> {
  const { data, error } = await getServiceRoleClient()
    .from('cc_decisions')
    .insert(inputToRow(input))
    .select('*')
    .single();
  if (error) throw new Error(`createDecision failed: ${error.message}`);
  return rowToDecision(data as DecisionRow);
}

export async function updateDecision(
  id: string,
  patch: DecisionPatch,
): Promise<Decision> {
  const row = patchToRow(patch);
  if (Object.keys(row).length === 0) {
    const existing = await getDecision(id);
    if (!existing) throw new Error(`updateDecision: ${id} not found`);
    return existing;
  }
  const { data, error } = await getServiceRoleClient()
    .from('cc_decisions')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateDecision failed: ${error.message}`);
  return rowToDecision(data as DecisionRow);
}

export async function deleteDecision(id: string): Promise<void> {
  const { error } = await getServiceRoleClient().from('cc_decisions').delete().eq('id', id);
  if (error) throw new Error(`deleteDecision failed: ${error.message}`);
}

export async function ensureDecisionsSeeded(): Promise<{
  seeded: boolean;
  count: number;
}> {
  const { count, error } = await getServiceRoleClient()
    .from('cc_decisions')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`ensureDecisionsSeeded count failed: ${error.message}`);
  if ((count ?? 0) > 0) return { seeded: false, count: count ?? 0 };

  const rows = SEED_DECISIONS.map((d) => inputToRow(d));
  const { error: insertErr, count: inserted } = await getServiceRoleClient()
    .from('cc_decisions')
    .insert(rows, { count: 'exact' });
  if (insertErr)
    throw new Error(`ensureDecisionsSeeded insert failed: ${insertErr.message}`);
  return { seeded: true, count: inserted ?? rows.length };
}
