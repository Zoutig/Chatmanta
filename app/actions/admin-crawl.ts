'use server';

// Admin Dashboard — bronbeheer per klant (taak 2).
//
// Org komt uit de route-param (niet de active-org cookie). requireV0Auth +
// org-validatie tegen KNOWN_ORGS vóór elke write — de service-role wrappers
// bypassen RLS, dus deze gate is de daadwerkelijke isolatie (defense-in-depth
// boven proxy.ts), exact zoals app/actions/controlroom.ts.
//
// DEACTIVEREN ≠ VERWIJDEREN. Deactiveren zet knowledge_sources.disabled_at én alle
// website_pages.included=false → de bron valt via de bestaande match_chunks_*-
// filter (0035) buiten de retrieval, maar blijft bestaan en is heractiveerbaar.
// Verwijderen is de harde delete (CASCADE → pages → chunks).
//
// "Bron toevoegen via crawl" hoort bij de crawl-machinerie (discover → batch-scrape
// → poll/ingest) en landt in de Crawl & Jobs-uitbouw (PR5); hier doen we documenten
// (platte tekst) + het beheer van bestaande bronnen.

import { revalidatePath } from 'next/cache';
import { KNOWN_ORGS, resolveOrgIdFromSlug } from '@/lib/v0/server/active-org';
import { getSystemJobClient } from '@/lib/supabase/admin';
import { ingestText, deleteDoc } from '@/lib/v0/server/rag';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';
import { requireV0Auth } from './_auth';

/** Valideer de org-slug tegen KNOWN_ORGS en geef de stabiele UUID terug. */
function requireKnownOrgId(slug: string): string {
  if (!(slug in KNOWN_ORGS)) fail('NOT_FOUND', `unknown org slug: ${slug}`);
  const id = resolveOrgIdFromSlug(slug);
  if (!id) fail('NOT_FOUND', `unresolvable org slug: ${slug}`);
  return id;
}

function revalidate(slug: string) {
  revalidatePath('/admindashboard', 'layout');
  revalidatePath(`/admindashboard/klanten/${slug}`);
}

/**
 * Activeer/deactiveer een website-bron. Deactiveren = disabled_at zetten + alle
 * pagina's included=false (bot gebruikt de bron niet meer); reactiveren = omgekeerd.
 * NB: per-pagina handmatige uitsluitingen gaan bij reactiveren verloren (alles weer
 * included=true) — bewuste V0-vereenvoudiging.
 */
export async function adminSetWebsiteSourceActiveAction(
  orgSlug: string,
  sourceId: string,
  active: boolean,
): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const sb = await getSystemJobClient({ reason: 'admin_toggle_source' });
    const now = new Date().toISOString();
    const { error: srcErr } = await sb
      .from('knowledge_sources')
      .update({ disabled_at: active ? null : now, updated_at: now })
      .eq('id', sourceId)
      .eq('organization_id', orgId);
    if (srcErr) throw new Error(`knowledge_sources toggle: ${srcErr.message}`);
    // Retrieval-uitsluiting via de bestaande website_pages.included-filter.
    const { error: pgErr } = await sb
      .from('website_pages')
      .update({ included: active })
      .eq('knowledge_source_id', sourceId)
      .eq('organization_id', orgId);
    if (pgErr) throw new Error(`website_pages bulk include: ${pgErr.message}`);
    revalidate(orgSlug);
    return {};
  });
}

/** Per-pagina include-toggle — fijnmazig "bewerken" van een website-bron. */
export async function adminSetPageIncludedAction(
  orgSlug: string,
  pageId: string,
  included: boolean,
): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const sb = await getSystemJobClient({ reason: 'admin_toggle_page' });
    const { error } = await sb
      .from('website_pages')
      .update({ included })
      .eq('id', pageId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`website_pages toggle: ${error.message}`);
    revalidate(orgSlug);
    return {};
  });
}

/** Verwijder een website-bron volledig (CASCADE → pages → chunks). Bevestiging in de UI. */
export async function adminDeleteWebsiteSourceAction(
  orgSlug: string,
  sourceId: string,
): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const sb = await getSystemJobClient({ reason: 'admin_delete_source' });
    const now = new Date().toISOString();
    // Lopende jobs eerst afsluiten zodat een crawl niet doorloopt op een verwijderde bron.
    await sb
      .from('processing_jobs')
      .update({ status: 'failed', error_message: 'Bron verwijderd via admin.', finished_at: now, updated_at: now })
      .eq('organization_id', orgId)
      .eq('job_type', 'crawl_website')
      .eq('target_id', sourceId)
      .in('status', ['pending', 'processing']);
    const { error } = await sb
      .from('knowledge_sources')
      .delete()
      .eq('id', sourceId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`knowledge_sources delete: ${error.message}`);
    revalidate(orgSlug);
    return {};
  });
}

/** Voeg een document toe vanuit platte tekst (ingestText embed't + chunked). */
export async function adminAddDocTextAction(
  orgSlug: string,
  filename: string,
  text: string,
): Promise<ActionResult<{ docId: string; chunks: number }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const name = filename.trim() || 'Tekstdocument';
    // ingestText valideert lege tekst zelf (INGEST_READ_FAILED na trimmen).
    const res = await ingestText({ filename: name, text, organizationId: orgId });
    revalidate(orgSlug);
    return { docId: res.docId, chunks: res.chunks };
  });
}

/** Verwijder een document (CASCADE → chunks). Bevestiging in de UI. */
export async function adminDeleteDocAction(orgSlug: string, docId: string): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    await deleteDoc(docId, orgId);
    revalidate(orgSlug);
    return {};
  });
}
