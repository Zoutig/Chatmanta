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
import { purgeAnswerCache, ingestText, deleteDoc } from '@/lib/v0/server/rag';
import { getMockWidgetSettings } from '../mock/widget-settings';
import { getMockChatbotSettings } from '../mock/chatbot-settings';
import { getMockManualQA } from '../mock/manual-qa';
import {
  TOP_QUESTIONS_DEFAULT,
  TOP_QUESTIONS_LIMITS,
  type ChatbotSettings,
  type ManualQA,
  type TopQuestionsConfig,
  type WidgetSettings,
} from '../types';
import { AppError } from '@/lib/errors/app-error';

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
  topQuestions: TopQuestionsConfig;
  updatedAt: string | null;
};

// Defensieve parser: bij corrupte/missende jsonb (handmatige DB-edit, oude
// row van vóór 0030) val terug op defaults zodat de UI niet breekt.
function parseTopQuestions(raw: unknown): TopQuestionsConfig {
  if (!raw || typeof raw !== 'object') return TOP_QUESTIONS_DEFAULT;
  const obj = raw as Record<string, unknown>;
  const minCount = typeof obj.minCount === 'number' ? obj.minCount : NaN;
  const topN = typeof obj.topN === 'number' ? obj.topN : NaN;
  if (
    !Number.isFinite(minCount) ||
    !Number.isFinite(topN) ||
    minCount < TOP_QUESTIONS_LIMITS.minCountMin ||
    minCount > TOP_QUESTIONS_LIMITS.minCountMax ||
    topN < TOP_QUESTIONS_LIMITS.topNMin ||
    topN > TOP_QUESTIONS_LIMITS.topNMax
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[parseTopQuestions] invalid value in DB, using defaults', raw);
    }
    return TOP_QUESTIONS_DEFAULT;
  }
  return { minCount, topN };
}

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
      .select('widget, chatbot, qa, top_questions, updated_at')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return { ...defaults, topQuestions: TOP_QUESTIONS_DEFAULT, updatedAt: null };
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
      topQuestions: parseTopQuestions(data.top_questions),
      updatedAt: data.updated_at as string,
    };
  } catch (err) {
    // Defensief: bij DB-fout valt UI terug op mock-defaults. UI breekt niet.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[getOrgSettings] DB read failed, using mock defaults', err);
    }
    return { ...defaults, topQuestions: TOP_QUESTIONS_DEFAULT, updatedAt: null };
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
  patch: {
    widget?: WidgetSettings;
    chatbot?: ChatbotSettings;
    qa?: ManualQA[];
    topQuestions?: TopQuestionsConfig;
  },
): Promise<void> {
  // Lees huidige row om de andere velden te bewaren bij partial-write.
  const { data: current, error: readErr } = await sb()
    .from('v0_org_settings')
    .select('widget, chatbot, qa, top_questions')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (readErr) throw new Error(`writeOrgSettings read: ${readErr.message}`);

  const next = {
    organization_id: orgId,
    widget: patch.widget ?? (current?.widget ?? {}),
    chatbot: patch.chatbot ?? (current?.chatbot ?? {}),
    qa: patch.qa ?? (current?.qa ?? []),
    top_questions:
      patch.topQuestions ?? (current?.top_questions ?? TOP_QUESTIONS_DEFAULT),
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
  // De answer-cache bevat geen stijl/taal in z'n key → een settings-wijziging
  // propageert pas na een purge. Awaiten (geen fire-and-forget): serverless kan
  // de runtime na de response killen. Purge mag de save nooit terugdraaien.
  await purgeAnswerCache(orgId);
  return next;
}

// ---------------------------------------------------------------------------
// QA CRUD — array-mutaties (persisted als hele array per write) + ingest-route
// (WP4, Niels item 11): een actieve Q&A wordt óók als kennisbank-chunk ge-embed,
// zodat ook een herformuleerde vraag de actuele Q&A vindt i.p.v. een oude
// gecrawlde chunk. ingestText/deleteDoc zijn de bestaande, org-gescopete wrappers.
// ---------------------------------------------------------------------------

/** Embed een actieve Q&A als kennisbank-document. Best-effort: een ingest-fout
 *  mag de Q&A-opslag nooit blokkeren (de tekst blijft in v0_org_settings.qa en de
 *  Jaccard-fast-path werkt nog) — backfill/edit pikt 'm later weer op. */
async function ingestQAForItem(orgId: string, item: ManualQA): Promise<string | undefined> {
  if (!item.active) return undefined;
  try {
    const text = `Vraag: ${item.question}\nAntwoord: ${item.answer}`;
    const res = await ingestText({
      filename: `Q&A: ${item.question.slice(0, 80)}`,
      text,
      organizationId: orgId,
      metadata: { origin: 'manual_qa', qa_id: item.id },
    });
    return res.docId;
  } catch (err) {
    console.warn(`[manual_qa] ingest failed qa=${item.id} org=${orgId}:`, err);
    return undefined;
  }
}

/** Verwijder het ge-embede Q&A-document. Niet-throwend: een delete-fout mag de
 *  mutatie niet terugdraaien (de cache wordt sowieso gepurged). */
async function safeDeleteQADoc(orgId: string, docId: string | undefined): Promise<void> {
  if (!docId) return;
  try {
    await deleteDoc(docId, orgId);
  } catch (err) {
    console.warn(`[manual_qa] deleteDoc failed doc=${docId} org=${orgId}:`, err);
  }
}

export async function upsertQAItem(
  orgSlug: OrgSlug,
  item: ManualQA,
): Promise<ManualQA[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const current = await getOrgSettings(orgSlug);
  const exists = current.qa.findIndex((x) => x.id === item.id);
  const oldDocId = exists >= 0 ? current.qa[exists].ingestedDocId : undefined;
  // Failure-veilige volgorde: ingest-nieuw → settings-update → delete-oud. Een
  // kort duplicaat-venster is beter dan een dataverlies-venster.
  const newDocId = await ingestQAForItem(orgId, item);
  const stored: ManualQA = { ...item, ingestedDocId: newDocId };
  const next: ManualQA[] =
    exists >= 0
      ? current.qa.map((x, i) => (i === exists ? stored : x))
      : [stored, ...current.qa];
  await writeOrgSettings(orgId, { qa: next });
  if (oldDocId && oldDocId !== newDocId) await safeDeleteQADoc(orgId, oldDocId);
  // Q&A telt mee in de antwoorden (fast-path + ge-embede chunk) → cache invalideren.
  await purgeAnswerCache(orgId);
  return next;
}

export async function deleteQAItem(
  orgSlug: OrgSlug,
  qaId: string,
): Promise<ManualQA[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const current = await getOrgSettings(orgSlug);
  const removed = current.qa.find((x) => x.id === qaId);
  // AVG-wisrecht: verwijder de ge-embede chunk EERST en propageer een fout. Anders
  // (settings-first + swallow) zou een gefaalde delete de Q&A uit het overzicht halen
  // terwijl de content via de zoek-index opvraagbaar blijft — "verwijderd" zou dan
  // liegen. Faalt de delete → action-error → operator kan opnieuw proberen.
  // Codex-review golf-2 #3.
  if (removed?.ingestedDocId) {
    await deleteDoc(removed.ingestedDocId, orgId);
  }
  const next = current.qa.filter((x) => x.id !== qaId);
  await writeOrgSettings(orgId, { qa: next });
  await purgeAnswerCache(orgId);
  return next;
}

export async function setQAActive(
  orgSlug: OrgSlug,
  qaId: string,
  active: boolean,
): Promise<ManualQA[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  const current = await getOrgSettings(orgSlug);
  const existing = current.qa.find((x) => x.id === qaId);
  let docId = existing?.ingestedDocId;
  if (existing) {
    if (active && !docId) {
      // Aanzetten zonder chunk → alsnog embedden.
      docId = await ingestQAForItem(orgId, { ...existing, active: true });
    } else if (!active && docId) {
      // Uitzetten → de chunk mag niet meer in retrieval opduiken.
      await safeDeleteQADoc(orgId, docId);
      docId = undefined;
    }
  }
  const next = current.qa.map((x) =>
    x.id === qaId
      ? { ...x, active, ingestedDocId: docId, updatedAt: new Date().toISOString() }
      : x,
  );
  await writeOrgSettings(orgId, { qa: next });
  await purgeAnswerCache(orgId);
  return next;
}

// ---------------------------------------------------------------------------
// Save: top-questions config (drempel + lijst-grootte)
// ---------------------------------------------------------------------------
export async function saveTopQuestionsConfig(
  orgSlug: OrgSlug,
  config: TopQuestionsConfig,
): Promise<TopQuestionsConfig> {
  const minCount = Math.floor(config.minCount);
  const topN = Math.floor(config.topN);
  if (
    !Number.isFinite(minCount) ||
    !Number.isFinite(topN) ||
    minCount < TOP_QUESTIONS_LIMITS.minCountMin ||
    minCount > TOP_QUESTIONS_LIMITS.minCountMax ||
    topN < TOP_QUESTIONS_LIMITS.topNMin ||
    topN > TOP_QUESTIONS_LIMITS.topNMax
  ) {
    throw new AppError('INPUT_INVALID', {
      message: `top-vragen config buiten range: minCount ∈ [${TOP_QUESTIONS_LIMITS.minCountMin}, ${TOP_QUESTIONS_LIMITS.minCountMax}], topN ∈ [${TOP_QUESTIONS_LIMITS.topNMin}, ${TOP_QUESTIONS_LIMITS.topNMax}]`,
    });
  }
  const next: TopQuestionsConfig = { minCount, topN };
  const orgId = KNOWN_ORGS[orgSlug].id;
  await writeOrgSettings(orgId, { topQuestions: next });
  return next;
}
