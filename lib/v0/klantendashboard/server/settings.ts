// V0 klantendashboard — single source of truth voor per-org settings.
//
// Wraps de `public.v0_org_settings` jsonb-tabel. Reads mergen de DB-row met
// de mock-defaults uit lib/v0/klantendashboard/mock/* zodat een org zonder
// row gewoon de "first-visit"-state krijgt. Writes doen partial-merge op de
// gerelevante jsonb-key en bumpen `updated_at` via DB-trigger.
//
// Service-role bypasst RLS — bewust, V0 heeft geen per-user identity.
// Bij V1 (Supabase Auth + organization_members) komt requireOrgAccess() er
// vóór, en kan de RLS-policy die hier in 0028 al staat het volle werk doen.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { getMockWidgetSettings } from '../mock/widget-settings';
import { getMockChatbotSettings } from '../mock/chatbot-settings';
import { getMockManualQA } from '../mock/manual-qa';
import type {
  ChatbotSettings,
  ManualQA,
  WidgetSettings,
} from '../types';

// ---------------------------------------------------------------------------
// Lazy supabase client (zelfde patroon als lib/v0/server/threads.ts)
// ---------------------------------------------------------------------------
let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export type OrgSettings = {
  widget: WidgetSettings;
  chatbot: ChatbotSettings;
  qa: ManualQA[];
  updatedAt: string | null;
};

// ---------------------------------------------------------------------------
// Read: merge DB-row met mock-defaults
// ---------------------------------------------------------------------------
export async function getOrgSettings(orgSlug: OrgSlug): Promise<OrgSettings> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const defaults = {
    widget: getMockWidgetSettings(orgSlug),
    chatbot: getMockChatbotSettings(orgSlug),
    qa: getMockManualQA(orgSlug),
  };

  try {
    const { data, error } = await sb()
      .from('v0_org_settings')
      .select('widget, chatbot, qa, updated_at')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return { ...defaults, updatedAt: null };
    }

    // Partial-merge: alleen velden die in jsonb staan overschrijven; rest blijft default.
    return {
      widget: {
        ...defaults.widget,
        ...((data.widget as Partial<WidgetSettings>) ?? {}),
      },
      chatbot: {
        ...defaults.chatbot,
        ...((data.chatbot as Partial<ChatbotSettings>) ?? {}),
      },
      // qa heeft geen "merge"-semantiek — als de array bestaat, gebruik 'm; anders default.
      qa: Array.isArray(data.qa) && data.qa.length > 0 ? (data.qa as ManualQA[]) : defaults.qa,
      updatedAt: data.updated_at as string,
    };
  } catch (err) {
    // Defensief: bij DB-fout valt UI terug op mock-defaults. UI breekt niet.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[getOrgSettings] DB read failed, using mock defaults', err);
    }
    return { ...defaults, updatedAt: null };
  }
}

// ---------------------------------------------------------------------------
// Internal helper: upsert de hele row met de drie velden.
// Supabase's upsert vereist een complete representation; we lezen daarom
// eerst, mergen client-side, en schrijven terug. Single round-trip naar de
// DB-tabel is voldoende voor V0 (geen concurrent-write-tooling nodig).
// ---------------------------------------------------------------------------
async function writeOrgSettings(
  orgId: string,
  patch: { widget?: WidgetSettings; chatbot?: ChatbotSettings; qa?: ManualQA[] },
): Promise<void> {
  // Lees huidige row om de andere velden te bewaren bij partial-write.
  const { data: current, error: readErr } = await sb()
    .from('v0_org_settings')
    .select('widget, chatbot, qa')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (readErr) throw new Error(`writeOrgSettings read: ${readErr.message}`);

  const next = {
    organization_id: orgId,
    widget: patch.widget ?? (current?.widget ?? {}),
    chatbot: patch.chatbot ?? (current?.chatbot ?? {}),
    qa: patch.qa ?? (current?.qa ?? []),
    // updated_at wordt door de DB-trigger geüpdatet
  };

  const { error: writeErr } = await sb()
    .from('v0_org_settings')
    .upsert(next, { onConflict: 'organization_id' });
  if (writeErr) throw new Error(`writeOrgSettings upsert: ${writeErr.message}`);
}

// ---------------------------------------------------------------------------
// Save: widget-settings (full-merge over defaults zodat UI altijd complete object opslaat)
// ---------------------------------------------------------------------------
export async function saveWidgetSettings(
  orgSlug: OrgSlug,
  patch: Partial<WidgetSettings>,
): Promise<WidgetSettings> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const current = await getOrgSettings(orgSlug);
  const next: WidgetSettings = { ...current.widget, ...patch };
  await writeOrgSettings(orgId, { widget: next });
  return next;
}

// ---------------------------------------------------------------------------
// Save: chatbot-settings (zelfde patroon)
// ---------------------------------------------------------------------------
export async function saveChatbotSettings(
  orgSlug: OrgSlug,
  patch: Partial<ChatbotSettings>,
): Promise<ChatbotSettings> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const current = await getOrgSettings(orgSlug);
  const next: ChatbotSettings = { ...current.chatbot, ...patch };
  await writeOrgSettings(orgId, { chatbot: next });
  return next;
}

// ---------------------------------------------------------------------------
// QA CRUD — alleen array-mutaties; persisted als hele array per write.
// ---------------------------------------------------------------------------
export async function upsertQAItem(
  orgSlug: OrgSlug,
  item: ManualQA,
): Promise<ManualQA[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const current = await getOrgSettings(orgSlug);
  const exists = current.qa.findIndex((x) => x.id === item.id);
  const next: ManualQA[] =
    exists >= 0
      ? current.qa.map((x, i) => (i === exists ? item : x))
      : [item, ...current.qa];
  await writeOrgSettings(orgId, { qa: next });
  return next;
}

export async function deleteQAItem(
  orgSlug: OrgSlug,
  qaId: string,
): Promise<ManualQA[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const current = await getOrgSettings(orgSlug);
  const next = current.qa.filter((x) => x.id !== qaId);
  await writeOrgSettings(orgId, { qa: next });
  return next;
}

export async function setQAActive(
  orgSlug: OrgSlug,
  qaId: string,
  active: boolean,
): Promise<ManualQA[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const current = await getOrgSettings(orgSlug);
  const next = current.qa.map((x) =>
    x.id === qaId ? { ...x, active, updatedAt: new Date().toISOString() } : x,
  );
  await writeOrgSettings(orgId, { qa: next });
  return next;
}
