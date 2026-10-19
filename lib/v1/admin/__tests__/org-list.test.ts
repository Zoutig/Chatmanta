// Run: node --import tsx --conditions=react-server --test lib/v1/admin/__tests__/org-list.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listAdminOrgs } from '../org-list';

/** Minimale nep-client: elke builder-methode chaint, await geeft de tabel-rijen. */
function fakeClient(tables: Record<string, unknown[]>): SupabaseClient {
  const builder = (rows: unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'order', 'in', 'eq']) b[m] = () => b;
    b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null });
    return b;
  };
  return { from: (t: string) => builder(tables[t] ?? []) } as unknown as SupabaseClient;
}

const profileRow = (orgId: string, status: string) => ({
  organization_id: orgId,
  commercial_status: status,
  technical_status_override: null,
  onboarding_phase: 'intake',
  customer_owner: 'niels',
  technical_owner: 'sebastiaan',
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  notes: null,
  next_action: null,
  next_action_owner: null,
  next_action_due_date: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
});

test('seed-org zonder profielrij is verborgen; testbedrijf met status actief niet', async () => {
  const sb = fakeClient({
    organizations: [
      { id: 'o1', name: 'Seed', slug: 'seed-org' },
      { id: 'o2', name: 'Testbedrijf echt', slug: 'testbedrijf-echt' },
      { id: 'o3', name: 'Klant', slug: 'klant-a' },
    ],
    admin_org_profile: [profileRow('o2', 'active')],
  });
  const res = await listAdminOrgs(sb);
  assert.deepEqual(res.orgs.map((o) => o.slug), ['testbedrijf-echt', 'klant-a']);
  assert.equal(res.hiddenCount, 1);
  // Virtueel profiel (geen rij) heeft een lege createdAt.
  assert.equal(res.profiles.get('o1')?.createdAt, '');

  const all = await listAdminOrgs(sb, { showInternal: true });
  assert.equal(all.orgs.length, 3);
  assert.equal(all.hiddenCount, 0);
});
