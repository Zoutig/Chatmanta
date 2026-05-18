// Command Center test-customer pipeline storage — service-role only, geen RLS.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CUSTOMER_DEFAULTS,
  type TestCustomer,
  type TestCustomerInput,
  type TestCustomerPatch,
} from '../types';
import { SEED_CUSTOMERS } from '../seed-customers';

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Customers storage requires Supabase env vars');
  }
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

type CustomerRow = {
  id: string;
  company_name: string;
  contact_person: string | null;
  website: string | null;
  company_type: string | null;
  status: string;
  owner: string;
  last_contact_date: string | null;
  next_action: string | null;
  notes: string | null;
  main_problems: string | null;
  case_study_potential: boolean;
  linked_task_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

function rowToCustomer(r: CustomerRow): TestCustomer {
  return {
    id: r.id,
    companyName: r.company_name,
    contactPerson: r.contact_person,
    website: r.website,
    companyType: r.company_type,
    status: r.status as TestCustomer['status'],
    owner: r.owner as TestCustomer['owner'],
    lastContactDate: r.last_contact_date,
    nextAction: r.next_action,
    notes: r.notes,
    mainProblems: r.main_problems,
    caseStudyPotential: r.case_study_potential ?? false,
    linkedTaskIds: r.linked_task_ids ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function inputToRow(input: TestCustomerInput) {
  return {
    company_name: input.companyName,
    contact_person: input.contactPerson ?? null,
    website: input.website ?? null,
    company_type: input.companyType ?? null,
    status: input.status ?? CUSTOMER_DEFAULTS.status,
    owner: input.owner ?? CUSTOMER_DEFAULTS.owner,
    last_contact_date: input.lastContactDate ?? null,
    next_action: input.nextAction ?? null,
    notes: input.notes ?? null,
    main_problems: input.mainProblems ?? null,
    case_study_potential: input.caseStudyPotential ?? false,
    linked_task_ids: input.linkedTaskIds ?? [],
  };
}

function patchToRow(patch: TestCustomerPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.companyName !== undefined) row.company_name = patch.companyName;
  if (patch.contactPerson !== undefined) row.contact_person = patch.contactPerson;
  if (patch.website !== undefined) row.website = patch.website;
  if (patch.companyType !== undefined) row.company_type = patch.companyType;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.owner !== undefined) row.owner = patch.owner;
  if (patch.lastContactDate !== undefined)
    row.last_contact_date = patch.lastContactDate;
  if (patch.nextAction !== undefined) row.next_action = patch.nextAction;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.mainProblems !== undefined) row.main_problems = patch.mainProblems;
  if (patch.caseStudyPotential !== undefined)
    row.case_study_potential = patch.caseStudyPotential;
  if (patch.linkedTaskIds !== undefined) row.linked_task_ids = patch.linkedTaskIds;
  return row;
}

export async function listCustomers(): Promise<TestCustomer[]> {
  const { data, error } = await sb()
    .from('cc_test_customers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listCustomers failed: ${error.message}`);
  return (data ?? []).map((r) => rowToCustomer(r as CustomerRow));
}

export async function getCustomer(id: string): Promise<TestCustomer | null> {
  const { data, error } = await sb()
    .from('cc_test_customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getCustomer failed: ${error.message}`);
  return data ? rowToCustomer(data as CustomerRow) : null;
}

export async function createCustomer(input: TestCustomerInput): Promise<TestCustomer> {
  const { data, error } = await sb()
    .from('cc_test_customers')
    .insert(inputToRow(input))
    .select('*')
    .single();
  if (error) throw new Error(`createCustomer failed: ${error.message}`);
  return rowToCustomer(data as CustomerRow);
}

export async function updateCustomer(
  id: string,
  patch: TestCustomerPatch,
): Promise<TestCustomer> {
  const row = patchToRow(patch);
  if (Object.keys(row).length === 0) {
    const existing = await getCustomer(id);
    if (!existing) throw new Error(`updateCustomer: ${id} not found`);
    return existing;
  }
  const { data, error } = await sb()
    .from('cc_test_customers')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateCustomer failed: ${error.message}`);
  return rowToCustomer(data as CustomerRow);
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await sb().from('cc_test_customers').delete().eq('id', id);
  if (error) throw new Error(`deleteCustomer failed: ${error.message}`);
}

export async function ensureCustomersSeeded(): Promise<{
  seeded: boolean;
  count: number;
}> {
  const { count, error } = await sb()
    .from('cc_test_customers')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`ensureCustomersSeeded count failed: ${error.message}`);
  if ((count ?? 0) > 0) return { seeded: false, count: count ?? 0 };

  const rows = SEED_CUSTOMERS.map((c) => inputToRow(c));
  const { error: insertErr, count: inserted } = await sb()
    .from('cc_test_customers')
    .insert(rows, { count: 'exact' });
  if (insertErr)
    throw new Error(`ensureCustomersSeeded insert failed: ${insertErr.message}`);
  return { seeded: true, count: inserted ?? rows.length };
}
