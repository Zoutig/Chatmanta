'use server';

// V1 admin — Maandelijkse Recap server-actions.
//
// Port van app/actions/recap.ts (V0) naar de V1-stack.
// Auth: requireJorionAdmin() (V1 Supabase Auth + AAL2-check) in plaats van requireV0Auth().
// Org-resolutie: UUID-validatie + DB-lookup in plaats van slug → KNOWN_ORGS.
// DB: getJorionAdminClient() → één client per action, doorgegeven aan recap-functies.

import { revalidatePath } from 'next/cache';
import { requireJorionAdmin } from '@/lib/auth';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import {
  RECAP_SIGNAL_STATUSES,
  RECAP_SIGNAL_TYPES,
  type RecapSignalStatus,
  type RecapSignalType,
} from '@/lib/controlroom/types';
import {
  computeSignals,
  ensureSignalRows,
  getOrCreateRecapId,
  getRecapStats,
  getTopQuestionsForMonth,
  getUnansweredForMonth,
  periodMonthKey,
  setSignalTriageStatus,
  updateRecapArtifacts,
} from '@/lib/v1/admin/recap';
import { generateRecapSummary } from '@/lib/controlroom/server/recap-llm';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';

const NOTES_MAX = 8000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertYearMonth(year: number, month: number): void {
  if (
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    fail('INPUT_INVALID', `ongeldige maand: ${year}-${month}`);
  }
}

/** Controleer UUID-formaat + DB-aanwezigheid; geef org-naam terug (voor LLM-prompt). */
async function requireOrgById(
  admin: Awaited<ReturnType<typeof getJorionAdminClient>>,
  orgId: string,
): Promise<{ name: string }> {
  if (!UUID_RE.test(orgId)) fail('INPUT_INVALID', `ongeldige orgId: ${orgId}`);
  const { data, error } = await admin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) fail('NOT_FOUND', `org niet gevonden: ${orgId}`);
  return { name: String(data.name) };
}

function revalidate() {
  revalidatePath('/v1/admin/maandelijkse-recap', 'layout');
}

/**
 * (Her)genereer de recap voor (org, maand): herbereken stats + signalen, schrijf
 * een verse AI-samenvatting (overgeslagen bij 0 gesprekken) en generated_at.
 * niels_notes blijft ongemoeid. Signaal-triage-rijen worden aangevuld (bestaande
 * status blijft behouden → 'genegeerd'/'behandeld' overleven regeneratie).
 */
export async function generateRecapAction(
  orgId: string,
  year: number,
  month: number,
): Promise<ActionResult<{ hadConversations: boolean; summaryEmpty: boolean }>> {
  return actionTry(async () => {
    await requireJorionAdmin();
    const admin = await getJorionAdminClient();
    const { name: orgName } = await requireOrgById(admin, orgId);
    assertYearMonth(year, month);
    const periodMonth = periodMonthKey(year, month);

    const [stats, topQuestions, topUnanswered] = await Promise.all([
      getRecapStats(admin, orgId, year, month),
      getTopQuestionsForMonth(admin, orgId, year, month),
      getUnansweredForMonth(admin, orgId, year, month),
    ]);
    const signals = computeSignals(stats, topUnanswered);

    const recapId = await getOrCreateRecapId(admin, orgId, periodMonth);

    let summary = '';
    if (stats.totalConversations > 0) {
      const res = await generateRecapSummary({
        companyName: orgName,
        year,
        month,
        stats,
        signals,
        topQuestions,
      });
      summary = res.summary;
    }

    await updateRecapArtifacts(admin, recapId, {
      aiSummary: summary.length > 0 ? summary : null,
      generatedAt: new Date().toISOString(),
    });
    await ensureSignalRows(admin, recapId, signals.map((s) => s.type));

    revalidate();
    return { hadConversations: stats.totalConversations > 0, summaryEmpty: summary.length === 0 };
  });
}

/** Sla Niels' notitie op (behouden bij regeneratie). Lege tekst → null. */
export async function saveRecapNotesAction(
  orgId: string,
  year: number,
  month: number,
  notes: string,
): Promise<ActionResult<{ saved: true }>> {
  return actionTry(async () => {
    await requireJorionAdmin();
    const admin = await getJorionAdminClient();
    await requireOrgById(admin, orgId);
    assertYearMonth(year, month);
    const trimmed = (notes ?? '').trim();
    if (trimmed.length > NOTES_MAX)
      fail('INPUT_INVALID', `notitie te lang (max ${NOTES_MAX} tekens)`);
    const recapId = await getOrCreateRecapId(admin, orgId, periodMonthKey(year, month));
    await updateRecapArtifacts(admin, recapId, {
      nielsNotes: trimmed.length > 0 ? trimmed : null,
    });
    revalidate();
    return { saved: true };
  });
}

/** Zet de triage-status van één signaal (nieuw/genegeerd/behandeld). */
export async function setRecapSignalStatusAction(
  orgId: string,
  year: number,
  month: number,
  signalType: string,
  status: string,
): Promise<ActionResult<{ updated: true }>> {
  return actionTry(async () => {
    await requireJorionAdmin();
    const admin = await getJorionAdminClient();
    await requireOrgById(admin, orgId);
    assertYearMonth(year, month);
    if (!(RECAP_SIGNAL_TYPES as readonly string[]).includes(signalType))
      fail('INPUT_INVALID', `onbekend signaal-type: ${signalType}`);
    if (!(RECAP_SIGNAL_STATUSES as readonly string[]).includes(status))
      fail('INPUT_INVALID', `onbekende status: ${status}`);
    const recapId = await getOrCreateRecapId(admin, orgId, periodMonthKey(year, month));
    await setSignalTriageStatus(
      admin,
      recapId,
      signalType as RecapSignalType,
      status as RecapSignalStatus,
    );
    revalidate();
    return { updated: true };
  });
}
