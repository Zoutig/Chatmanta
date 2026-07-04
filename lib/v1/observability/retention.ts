import 'server-only';

// V1 AVG-retentie — harde delete van bezoekers-PII in contact_requests.
//
// V1-tegenhanger van lib/controlroom/server/retention.ts (V0). Bewust MINIMAAL: V1
// slaat (nog) alleen bezoekers-PII op in contact_requests (migr 0011). Chat-inhoud
// (query_log / conversations) kent in V1 nog GEEN per-org retentie-instelling, dus
// die anonimisering laat ik hier bewust weg — komt pas als er een V1-settings-veld
// voor bestaat. Dit pad doet één ding: contactverzoeken ouder dan 90 dagen fysiek
// verwijderen (geen anonimisering: de AVG eist volledige verwijdering van naam/
// e-mail/telefoon van derden).

import type { SupabaseClient } from '@supabase/supabase-js';

// Vaste, niet-configureerbare harde-delete-termijn (dagen). Spiegelt de
// "na 90 dagen verwijderd"-belofte in de widget-consenttekst én de bevestigdialoog
// op de Instellingen-pagina. Bewust LOS van een per-org chat-retentie: bezoekers-PII
// verdient een eigen, harde grens die de klant niet kan oprekken.
export const V1_CONTACT_RETENTION_DAYS = 90;

/**
 * ISO-cutoff: middernacht (lokaal), `days` dagen terug. Een rij met
 * `created_at < cutoff` is "ouder dan `days` dagen" en valt onder de harde delete.
 * Cutoff op created_at (NIET op een statuswijziging: een 'handled'-update mag de klok
 * niet resetten). Pure functie mét injecteerbare `now` zodat het leeftijdsfilter — het
 * enige risicovolle stukje (verkeerd teken of off-by-one zou álles of niets raken) —
 * los unit-testbaar is.
 */
export function contactRetentionCutoffIso(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export type V1RetentionResult = {
  retentionDays: number;
  cutoffIso: string;
  candidates: number;
  applied: boolean;
};

/**
 * Hard-delete van contact_requests ouder dan V1_CONTACT_RETENTION_DAYS (op created_at),
 * cross-org. Het leeftijdsfilter `.lt('created_at', cutoff)` is de ENIGE selectie en
 * staat keihard vast — er is bewust geen pad dat zonder dit filter verwijdert (dat zou
 * de hele tabel wissen). dryRun (apply=false) telt alleen. Geen PII in de return of de
 * logs (alleen aantallen). Service-role: contact_requests heeft RLS aan zonder
 * DELETE-policy, dus alleen de service-role kan verwijderen.
 */
export async function runV1ContactRetention(
  svc: SupabaseClient,
  opts: { apply: boolean },
): Promise<V1RetentionResult> {
  const cutoff = contactRetentionCutoffIso(V1_CONTACT_RETENTION_DAYS);

  // Vangnet vóór een destructieve delete: een leeg/ongeldig cutoff zou de leeftijds-
  // grens onbruikbaar maken. contactRetentionCutoffIso levert dit nooit, maar deze
  // guard borgt dat een toekomstige refactor het delete-pad niet ongefilterd laat.
  if (!cutoff || Number.isNaN(Date.parse(cutoff))) {
    console.error('[v1/retention] ongeldige cutoff — delete overgeslagen');
    return { retentionDays: V1_CONTACT_RETENTION_DAYS, cutoffIso: cutoff, candidates: 0, applied: false };
  }

  const { count, error: countErr } = await svc
    .from('contact_requests')
    .select('id', { count: 'exact', head: true })
    .lt('created_at', cutoff);
  // Luid loggen i.p.v. stil 0 teruggeven (bv. als migr 0011 ontbreekt) — geen PII.
  if (countErr) {
    console.error('[v1/retention] contactverzoeken-telling faalde:', countErr.message);
  }

  if (opts.apply) {
    const { error: delErr } = await svc
      .from('contact_requests')
      .delete()
      .lt('created_at', cutoff); // leeftijdsfilter — verplicht, enige selectie
    if (delErr) {
      console.error('[v1/retention] contactverzoeken-delete faalde:', delErr.message);
    }
  }

  return {
    retentionDays: V1_CONTACT_RETENTION_DAYS,
    cutoffIso: cutoff,
    candidates: count ?? 0,
    applied: opts.apply,
  };
}
