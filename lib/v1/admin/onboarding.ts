// V1 admin-overlay — admin_onboarding_items (N per org).
//
// Port van lib/controlroom/server/onboarding.ts. Auto-seed via idempotente upsert
// (unique org,key) — precies dezelfde strategie als V0. Tabel heeft een FK ->
// organizations(id) on delete cascade; geen KNOWN_ORGS-check nodig.

import 'server-only';

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { ONBOARDING_TEMPLATE } from '@/lib/controlroom/onboarding-template';
import type {
  OnboardingItem,
  OnboardingItemPatch,
  OnboardingItemStatus,
  Owner,
} from '@/lib/controlroom/types';
import type { OnboardingFacts } from './onboarding-derive';

type AdminClient = Awaited<ReturnType<typeof getJorionAdminClient>>;

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

/** Idempotent: seed template-items voor een org zonder bestaande rijen. */
async function ensureOnboardingSeeded(admin: AdminClient, organizationId: string): Promise<void> {
  const { count, error } = await admin
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
  const { error: insErr } = await admin
    .from('admin_onboarding_items')
    .upsert(rows, { onConflict: 'organization_id,key', ignoreDuplicates: true });
  if (insErr) throw new Error(`ensureOnboardingSeeded insert failed: ${insErr.message}`);
}

export async function listOnboardingItems(
  admin: AdminClient,
  organizationId: string,
): Promise<OnboardingItem[]> {
  await ensureOnboardingSeeded(admin, organizationId);
  const { data, error } = await admin
    .from('admin_onboarding_items')
    .select('*')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`listOnboardingItems V1 failed: ${error.message}`);
  return (data ?? []).map((r) => rowToItem(r as ItemRow));
}

export async function updateOnboardingItem(
  admin: AdminClient,
  id: string,
  organizationId: string,
  patch: OnboardingItemPatch,
): Promise<OnboardingItem> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    row.status = patch.status;
    row.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
  }
  if (patch.owner !== undefined) row.owner = patch.owner;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (Object.keys(row).length === 0) throw new Error('updateOnboardingItem: empty patch');
  const { data, error } = await admin
    .from('admin_onboarding_items')
    .update(row)
    // Scoop op org + id — dubbele poort zodat admin nooit items van andere org kan raken
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single();
  if (error) throw new Error(`updateOnboardingItem V1 failed: ${error.message}`);
  return rowToItem(data as ItemRow);
}

// ─────────────── Afleidbare feiten (lib/v1/admin/onboarding-derive.ts) ───────────────

/** Leest de feiten waaruit onboardingstappen afleidbaar zijn. Alleen lezen, alles
 *  org-gescoped; faalt per feit stil naar 'false' (dan blijft de stap gewoon handmatig). */
export async function getOnboardingFacts(admin: AdminClient, organizationId: string): Promise<OnboardingFacts> {
  const head = { count: 'exact' as const, head: true };
  const has = (p: PromiseLike<{ count: number | null }>) =>
    Promise.resolve(p).then(
      (r) => (r.count ?? 0) > 0,
      () => false,
    );
  const [contactFilled, websiteSource, crawlStarted, crawlSucceeded, uploadedDocs, bot] = await Promise.all([
    Promise.resolve(
      admin
        .from('admin_org_profile')
        .select('contact_name, contact_email')
        .eq('organization_id', organizationId)
        .maybeSingle(),
    ).then(
      (r) => {
        const p = r.data as { contact_name: string | null; contact_email: string | null } | null;
        return Boolean(p?.contact_name?.trim() || p?.contact_email?.trim());
      },
      () => false,
    ),
    has(
      admin
        .from('knowledge_sources')
        .select('id', head)
        .eq('organization_id', organizationId)
        .eq('type', 'website')
        .is('deleted_at', null),
    ),
    has(admin.from('processing_jobs').select('id', head).eq('organization_id', organizationId).eq('job_type', 'crawl_website')),
    has(
      admin
        .from('processing_jobs')
        .select('id', head)
        .eq('organization_id', organizationId)
        .eq('job_type', 'crawl_website')
        .eq('status', 'completed'),
    ),
    has(
      admin
        .from('documents')
        .select('id', head)
        .eq('organization_id', organizationId)
        .eq('source', 'upload')
        .is('deleted_at', null),
    ),
    Promise.resolve(
      admin
        .from('chatbots')
        .select('allowed_domains, widget_last_seen_at')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ).then(
      (r) => r.data as { allowed_domains: string[] | null; widget_last_seen_at: string | null } | null,
      () => null,
    ),
  ]);
  return {
    contactFilled,
    websiteSource,
    crawlStarted,
    crawlSucceeded,
    uploadedDocs,
    allowedDomains: (bot?.allowed_domains?.length ?? 0) > 0,
    widgetSeen: Boolean(bot?.widget_last_seen_at),
  };
}
