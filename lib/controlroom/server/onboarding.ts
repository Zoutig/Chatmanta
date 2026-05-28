// Control Room — admin_onboarding_items storage (N per tenant-org).
//
// listOnboardingItems seedt standaard de template-checklist als een org nog
// geen items heeft (auto-seed), zodat elke org direct de volledige checklist
// toont. Seeden is idempotent via unique(organization_id, key).

import 'server-only';

import {
  type OnboardingItem,
  type OnboardingItemPatch,
  type OnboardingItemStatus,
  type Owner,
} from '../types';
import { ONBOARDING_TEMPLATE } from '../onboarding-template';
import { sb } from './db';

type ItemRow = {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  status: string;
  owner: string | null;
  notes: string | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToItem(r: ItemRow): OnboardingItem {
  return {
    id: r.id,
    organizationId: r.organization_id,
    key: r.key,
    label: r.label,
    status: r.status as OnboardingItemStatus,
    owner: (r.owner as Owner | null) ?? null,
    notes: r.notes,
    sortOrder: r.sort_order,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Idempotent: seed de template-items voor een org als die nog geen items heeft.
 *  ignoreDuplicates zodat parallelle seeds niet botsen op unique(org,key). */
export async function ensureOnboardingSeeded(organizationId: string): Promise<void> {
  const { count, error } = await sb()
    .from('admin_onboarding_items')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);
  if (error) throw new Error(`ensureOnboardingSeeded count failed: ${error.message}`);
  if ((count ?? 0) > 0) return;

  const rows = ONBOARDING_TEMPLATE.map((t, i) => ({
    organization_id: organizationId,
    key: t.key,
    label: t.label,
    status: 'todo',
    sort_order: i,
  }));
  const { error: insErr } = await sb()
    .from('admin_onboarding_items')
    .upsert(rows, { onConflict: 'organization_id,key', ignoreDuplicates: true });
  if (insErr) throw new Error(`ensureOnboardingSeeded insert failed: ${insErr.message}`);
}

export async function listOnboardingItems(
  organizationId: string,
  opts: { autoSeed?: boolean } = {},
): Promise<OnboardingItem[]> {
  if (opts.autoSeed !== false) await ensureOnboardingSeeded(organizationId);
  const { data, error } = await sb()
    .from('admin_onboarding_items')
    .select('*')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`listOnboardingItems failed: ${error.message}`);
  return (data ?? []).map((r) => rowToItem(r as ItemRow));
}

export async function updateOnboardingItem(
  id: string,
  patch: OnboardingItemPatch,
): Promise<OnboardingItem> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    row.status = patch.status;
    // completed_at volgt de status: gezet bij 'done', anders gewist.
    row.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
  }
  if (patch.owner !== undefined) row.owner = patch.owner;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (Object.keys(row).length === 0) {
    throw new Error('updateOnboardingItem: empty patch');
  }
  const { data, error } = await sb()
    .from('admin_onboarding_items')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateOnboardingItem failed: ${error.message}`);
  return rowToItem(data as ItemRow);
}
