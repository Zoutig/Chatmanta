'use client';
// Compacte statusregel per websitebron (spec §7.4, bijlage A):
//  - crawl bezig: voortgang (dunne balk + teller), hint "houd tabblad open",
//    tempo-beperking als korte hint;
//  - crawl mislukt: statusregel in danger-tone, technische details ingeklapt;
//  - "Firecrawl vond pagina's, maar er kwam niets binnen": statusregel (aandacht).
// Alle diagnostiek uit de vorige kaart blijft beschikbaar onder "Technische details".
import { AlertTriangle, CircleAlert } from 'lucide-react';
import type { WebsiteSource } from '../types';

/** Mensleesbare labels voor de decision-codes uit de job-verwerker. */
const DECISION_LABEL: Record<string, string> = {
  'start-failed': 'Starten mislukt',
  'no-crawl-id': 'Geen crawl-ID',
  pending: 'Bezig',
  'rate-limited': 'Tijdelijk vertraagd',
  timeout: 'Time-out',
  'firecrawl-failed': 'Firecrawl mislukt',
  'discovery-empty': 'Geen pagina’s gevonden',
  ingested: 'Verwerkt',
  exception: 'Onverwachte fout',
};

/** Klant-vriendelijke kop + uitleg per terminale faal-reden. Valt terug op de rauwe
 *  job-fout als de reden onbekend is; de exacte techniek staat in "Technische details". */
const FAIL_COPY: Record<string, { headline: string; detail: string }> = {
  'discovery-empty': {
    headline: 'We konden geen pagina’s vinden op deze URL',
    detail: 'Controleer of het webadres klopt en of je site een bereikbare sitemap heeft. Je kunt ook losse pagina’s toevoegen.',
  },
  timeout: {
    headline: 'Het ophalen duurde te lang',
    detail: 'De website reageerde te traag om af te ronden. Probeer het later opnieuw, of voeg de belangrijkste pagina’s los toe.',
  },
  'firecrawl-failed': {
    headline: 'We konden de website niet volledig laden',
    detail: 'De crawl-service gaf een fout terug. Probeer het opnieuw; lukt het niet, voeg dan losse pagina’s toe.',
  },
  'rate-limited': {
    headline: 'De website beperkte het tempo',
    detail: 'Er kwamen te veel verzoeken te snel. Wacht even en haal de website opnieuw op.',
  },
};

function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'medium' });
}

/** Voortgang van een lopende crawl. */
export function CrawlProgressLine({
  completed,
  total,
  rateLimited,
}: {
  completed: number;
  total: number;
  /** De bron beperkt ons tempo (Firecrawl 429); we pollen automatisch door. */
  rateLimited: boolean;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 5;
  return (
    <div className="v1-kb-status" role="status">
      <div className="v1-kb-status-line">
        <span className="v1-spinner" aria-hidden="true" />
        <span>Je website wordt verwerkt</span>
        <span className="v1-kb-status-num">
          {completed} van {total || '…'} pagina&apos;s
        </span>
      </div>
      <div className="v1-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="v1-hint">
        Duurt meestal 1 tot 3 minuten. Houd dit tabblad open; sluit je het, dan gaat de verwerking verder zodra je terugkomt.
      </p>
      {rateLimited ? (
        <p className="v1-hint">De website beperkt even het tempo. We proberen automatisch verder, dit kan iets langer duren.</p>
      ) : null}
    </div>
  );
}

/**
 * Statusregel bij een mislukte of "leeg-maar-klaar" crawl. Geeft null terug als
 * er niets zinnigs te tonen is.
 */
export function CrawlDiagnostics({
  job,
  pagesCount,
  isCrawling,
}: {
  job: WebsiteSource['job'];
  pagesCount: number;
  isCrawling: boolean;
}) {
  if (!job || isCrawling) return null;

  const failed = job.status === 'failed';
  // "Firecrawl meldde pagina’s, maar er kwam niets binnen": het lege-succes-geval.
  const completeEvent = job.events.find((e) => e.eventType === 'complete');
  const emptySuccess =
    !failed && pagesCount === 0 && completeEvent != null && (completeEvent.total ?? 0) > 0;

  if (!failed && !emptySuccess) return null;

  const failDecision = job.events.find((e) => e.eventType === 'fail')?.decision ?? null;
  const failCopy = failDecision ? FAIL_COPY[failDecision] : undefined;

  const headline = failed
    ? failCopy?.headline ?? 'Het vorige ophalen is mislukt'
    : 'Firecrawl vond pagina’s, maar er kwam niets binnen';
  const detail = failed
    ? failCopy?.detail ?? job.error ?? 'Onbekende reden.'
    : `Firecrawl meldde ${completeEvent?.total ?? 0} pagina’s, maar we ontvingen er ${completeEvent?.dataCount ?? 0}` +
      (completeEvent?.hasNext ? ' (de resultaten zijn over meerdere pagina’s verdeeld).' : '.');
  const Icon = failed ? AlertTriangle : CircleAlert;

  return (
    <div className="v1-kb-status" data-tone={failed ? 'danger' : 'warn'} role={failed ? 'alert' : undefined}>
      <div className="v1-kb-status-line">
        <Icon size={15} strokeWidth={2} aria-hidden="true" />
        <span>{headline}</span>
      </div>
      <p>{detail}</p>

      {job.events.length > 0 && (
        <details className="v1-details">
          <summary>Technische details</summary>
          <div className="v1-kb-scroll-x">
            <table className="v1-kb-events">
              <thead>
                <tr>
                  <th scope="col">Tijd</th>
                  <th scope="col">Stap</th>
                  <th scope="col">Firecrawl</th>
                  <th scope="col">Voortgang</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {job.events.map((e, i) => (
                  <tr key={i}>
                    <td>{fmtTime(e.createdAt)}</td>
                    <td>{e.decision ? DECISION_LABEL[e.decision] ?? e.decision : e.eventType}</td>
                    <td>{e.firecrawlStatus ?? '-'}</td>
                    <td>
                      {e.total != null ? `${e.completed ?? 0}/${e.total}` : '-'}
                      {e.dataCount != null ? ` · ${e.dataCount} ontv.` : ''}
                      {e.hasNext ? ' · meer' : ''}
                    </td>
                    <td>{e.message ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
