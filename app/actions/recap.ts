'use server';

// Maandelijkse Recap — server-actions (admin-overlay).
//
// Auth: requireV0Auth() vóór elke service-role-call (defense-in-depth boven
// proxy.ts), exact zoals app/actions/controlroom.ts. Elke org-slug wordt tegen
// KNOWN_ORGS gevalideerd vóór een write — de overlay-tabellen hebben geen FK naar
// organizations, dus dit is de poort tegen een willekeurige organization_id. De
// enum-velden worden server-side door de DB CHECK-constraints (0047) afgedwongen.

import { revalidatePath } from 'next/cache';
import { KNOWN_ORGS, resolveOrgIdFromSlug, type OrgSlug } from '@/lib/v0/server/active-org';
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
} from '@/lib/controlroom/server/recap';
import { generateRecapSummary } from '@/lib/controlroom/server/recap-llm';
import { requireV0Auth } from './_auth';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';

const NOTES_MAX = 8000;

/** Valideer een org-slug tegen KNOWN_ORGS en geef de stabiele UUID terug. */
function requireKnownOrgId(slug: string): string {
  if (!(slug in KNOWN_ORGS)) fail('NOT_FOUND', `unknown org slug: ${slug}`);
  const id = resolveOrgIdFromSlug(slug);
  if (!id) fail('NOT_FOUND', `unresolvable org slug: ${slug}`);
  return id;
}

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

/** 'layout' herrendert de hele /admindashboard-tree (overzicht + detail + tabs). */
function revalidate() {
  revalidatePath('/admindashboard', 'layout');
}

/**
 * (Her)genereer de recap voor (org, maand): herbereken stats + signalen, schrijf
 * een verse AI-samenvatting (overgeslagen bij 0 gesprekken) en generated_at.
 * niels_notes blijft ongemoeid. Signaal-triage-rijen worden aangevuld (bestaande
 * status blijft behouden → 'genegeerd'/'behandeld' overleven regeneratie).
 */
export async function generateRecapAction(
  orgSlug: string,
  year: number,
  month: number,
): Promise<ActionResult<{ hadConversations: boolean; summaryEmpty: boolean }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    assertYearMonth(year, month);
    const periodMonth = periodMonthKey(year, month);

    const [stats, topQuestions, topUnanswered] = await Promise.all([
      getRecapStats(orgId, year, month),
      getTopQuestionsForMonth(orgId, year, month),
      getUnansweredForMonth(orgId, year, month),
    ]);
    const signals = computeSignals(stats, topUnanswered);

    const recapId = await getOrCreateRecapId(orgId, periodMonth);

    let summary = '';
    if (stats.totalConversations > 0) {
      const res = await generateRecapSummary({
        companyName: KNOWN_ORGS[orgSlug as OrgSlug].name,
        year,
        month,
        stats,
        signals,
        topQuestions,
      });
      summary = res.summary;
    }

    await updateRecapArtifacts(recapId, {
      aiSummary: summary.length > 0 ? summary : null,
      generatedAt: new Date().toISOString(),
    });
    await ensureSignalRows(recapId, signals.map((s) => s.type));

    revalidate();
    return { hadConversations: stats.totalConversations > 0, summaryEmpty: summary.length === 0 };
  });
}

/** Sla Niels' notitie op (behouden bij regeneratie). Lege tekst → null. */
export async function saveRecapNotesAction(
  orgSlug: string,
  year: number,
  month: number,
  notes: string,
): Promise<ActionResult<{ saved: true }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    assertYearMonth(year, month);
    const trimmed = (notes ?? '').trim();
    if (trimmed.length > NOTES_MAX) fail('INPUT_INVALID', `notitie te lang (max ${NOTES_MAX} tekens)`);
    const recapId = await getOrCreateRecapId(orgId, periodMonthKey(year, month));
    await updateRecapArtifacts(recapId, { nielsNotes: trimmed.length > 0 ? trimmed : null });
    revalidate();
    return { saved: true };
  });
}

/** Zet de triage-status van één signaal (nieuw/genegeerd/behandeld). */
export async function setRecapSignalStatusAction(
  orgSlug: string,
  year: number,
  month: number,
  signalType: string,
  status: string,
): Promise<ActionResult<{ updated: true }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    assertYearMonth(year, month);
    if (!(RECAP_SIGNAL_TYPES as readonly string[]).includes(signalType)) {
      fail('INPUT_INVALID', `onbekend signaal-type: ${signalType}`);
    }
    if (!(RECAP_SIGNAL_STATUSES as readonly string[]).includes(status)) {
      fail('INPUT_INVALID', `onbekende status: ${status}`);
    }
    const recapId = await getOrCreateRecapId(orgId, periodMonthKey(year, month));
    await setSignalTriageStatus(recapId, signalType as RecapSignalType, status as RecapSignalStatus);
    revalidate();
    return { updated: true };
  });
}
