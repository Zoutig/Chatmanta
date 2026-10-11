'use client';
import { AlertTriangle, Info } from 'lucide-react';
import type { WebsiteSource } from '@/lib/v0/server/crawler';

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

/**
 * Klant-vriendelijke kop + uitleg per terminale faal-reden. Valt terug op de rauwe
 * job-fout als de reden onbekend is; de exacte techniek staat in "Technische details".
 */
const FAIL_COPY: Record<string, { headline: string; detail: string }> = {
  'discovery-empty': {
    headline: 'We konden geen pagina’s vinden op deze URL',
    detail: 'Controleer of het webadres klopt en of je site een bereikbare sitemap heeft. Je kunt ook losse pagina’s toevoegen.',
  },
  timeout: {
    headline: 'De crawl duurde te lang',
    detail: 'De website reageerde te traag om af te ronden. Probeer het later opnieuw, of voeg de belangrijkste pagina’s los toe.',
  },
  'firecrawl-failed': {
    headline: 'We konden de website niet volledig laden',
    detail: 'De crawl-service gaf een fout terug. Probeer het opnieuw; lukt het niet, voeg dan losse pagina’s toe.',
  },
  'rate-limited': {
    headline: 'De website beperkte het tempo',
    detail: 'Er kwamen te veel verzoeken te snel. Wacht even en start de crawl opnieuw.',
  },
};

function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'medium' });
}

/**
 * Toont, bij een mislukte of "leeg-maar-klaar" crawl, de reden + een inklapbaar
 * overzicht van de laatste diagnostiek-events. Klant-zichtbaar, nuchtere taal.
 * Geeft null terug als er niets zinnigs te tonen is.
 */
export function CrawlDiagnostics({
  job,
  pagesCount,
  isCrawling,
  style,
}: {
  job: WebsiteSource['job'];
  pagesCount: number;
  isCrawling: boolean;
  style?: React.CSSProperties;
}) {
  if (!job || isCrawling) return null;

  const failed = job.status === 'failed';
  // "Firecrawl meldde pagina's, maar er kwam niets binnen" — het lege-succes-geval.
  const completeEvent = job.events.find((e) => e.eventType === 'complete');
  const emptySuccess =
    !failed && pagesCount === 0 && completeEvent != null && (completeEvent.total ?? 0) > 0;

  if (!failed && !emptySuccess) return null;

  // Terminale faal-reden → klant-vriendelijke kop/uitleg (val terug op de rauwe fout).
  const failDecision = job.events.find((e) => e.eventType === 'fail')?.decision ?? null;
  const failCopy = failDecision ? FAIL_COPY[failDecision] : undefined;

  const headline = failed
    ? failCopy?.headline ?? 'De vorige crawl is mislukt'
    : 'Firecrawl vond pagina’s, maar er kwam niets binnen';
  const detail = failed
    ? failCopy?.detail ?? job.error ?? 'Onbekende reden.'
    : `Firecrawl meldde ${completeEvent?.total ?? 0} pagina’s, maar we ontvingen er ${completeEvent?.dataCount ?? 0}` +
      (completeEvent?.hasNext ? ' (de resultaten zijn over meerdere pagina’s verdeeld).' : '.');

  return (
    <div className="klant-card" data-tone={failed ? 'danger' : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, ...style }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 600 }}>
        {failed ? <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          : <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
        <span>{headline}</span>
      </div>
      <p style={{ margin: 0, color: 'var(--klant-fg-dim)' }}>{detail}</p>

      {job.events.length > 0 && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--klant-fg-dim)' }}>Technische details</summary>
          <div style={{ marginTop: 8, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--klant-fg-dim)' }}>
                  <th style={th}>Tijd</th>
                  <th style={th}>Stap</th>
                  <th style={th}>Firecrawl</th>
                  <th style={th}>Voortgang</th>
                  <th style={th}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {job.events.map((e, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--klant-border, #ece8df)' }}>
                    <td style={td}>{fmtTime(e.createdAt)}</td>
                    <td style={td}>{e.decision ? DECISION_LABEL[e.decision] ?? e.decision : e.eventType}</td>
                    <td style={td}>{e.firecrawlStatus ?? '—'}</td>
                    <td style={td}>
                      {e.total != null ? `${e.completed ?? 0}/${e.total}` : '—'}
                      {e.dataCount != null ? ` · ${e.dataCount} ontv.` : ''}
                      {e.hasNext ? ' · meer' : ''}
                    </td>
                    <td style={td}>{e.message ?? '—'}</td>
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

const th: React.CSSProperties = { padding: '4px 8px', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '4px 8px', verticalAlign: 'top' };
