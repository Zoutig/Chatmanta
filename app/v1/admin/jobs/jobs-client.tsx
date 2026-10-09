'use client';

// V1 admin — crawl-jobs tabel + status-filter + per-rij retry. Data komt serialiseerbaar
// binnen (server bouwt de rijen, incl. de opgemaakte datum); deze laag doet alleen
// filter + de retry-actie.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, EmptyState, type Tone } from '@/app/v1/_ui/feedback';
import { Button } from '@/app/v1/_ui/button';
import { DataTable, NumCell } from '../_ui/data-table';
import { adminRetryCrawlAction } from './actions';

export type JobRow = {
  jobId: string;
  orgName: string;
  host: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  errorMessage: string | null;
  /** Al op de server opgemaakt (Europe/Amsterdam). */
  createdLabel: string;
  lastEvent: string | null;
};

const STATUS: Record<JobRow['status'], { tone: Tone; label: string }> = {
  pending: { tone: 'neutral', label: 'In wachtrij' },
  processing: { tone: 'accent', label: 'Bezig' },
  completed: { tone: 'ok', label: 'Klaar' },
  failed: { tone: 'danger', label: 'Mislukt' },
};

export function JobsClient({ rows }: { rows: JobRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('all');

  const filtered = useMemo(
    () => (status === 'all' ? rows : rows.filter((r) => r.status === status)),
    [rows, status],
  );

  function retry(jobId: string) {
    setError(null);
    setBusy(jobId);
    start(async () => {
      const res = await adminRetryCrawlAction(jobId);
      setBusy(null);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Er ging iets mis. Probeer het opnieuw.');
    });
  }

  return (
    <section className="v1-card">
      <div className="v1-adm-card-head">
        <label className="v1-adm-inline-field">
          <span className="v1-sr-only">Filter op status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="v1-input v1-adm-select">
            <option value="all">Alle statussen</option>
            <option value="pending">In wachtrij</option>
            <option value="processing">Bezig</option>
            <option value="completed">Klaar</option>
            <option value="failed">Mislukt</option>
          </select>
        </label>
        <span className="v1-adm-muted">
          {filtered.length} van {rows.length}
        </span>
      </div>

      {error ? (
        <p role="alert" className="v1-alert v1-alert--error">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState>{rows.length === 0 ? 'Nog geen crawls.' : 'Geen crawls met deze status.'}</EmptyState>
      ) : (
        <DataTable
          label="Crawls"
          columns={[
            { label: 'Klant' },
            { label: 'Bron' },
            { label: 'Status' },
            { label: 'Pogingen', num: true },
            { label: 'Laatste melding' },
            { label: 'Gestart' },
            { label: <span className="v1-sr-only">Actie</span>, width: '1%' },
          ]}
        >
          {filtered.map((r) => {
            const terminal = r.status === 'failed' || r.status === 'completed';
            const s = STATUS[r.status];
            return (
              <tr key={r.jobId}>
                <td style={{ fontWeight: 500 }}>{r.orgName}</td>
                <td title={r.host ?? ''}>
                  <span className="v1-adm-clip">{r.host ?? 'Onbekend'}</span>
                </td>
                <td>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </td>
                <NumCell>{r.attempts}</NumCell>
                <td
                  className={r.errorMessage ? 'v1-adm-danger' : 'v1-adm-muted'}
                  title={r.errorMessage ?? r.lastEvent ?? ''}
                >
                  <span className="v1-adm-clip">{r.errorMessage ?? r.lastEvent ?? 'Geen'}</span>
                </td>
                <td className="v1-adm-muted" style={{ whiteSpace: 'nowrap' }}>
                  {r.createdLabel}
                </td>
                <td>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending || !terminal}
                    loading={busy === r.jobId}
                    onClick={() => retry(r.jobId)}
                    title={terminal ? 'Start een nieuwe crawl voor deze bron (kost Firecrawl-tegoed)' : 'Crawl loopt nog'}
                  >
                    Opnieuw proberen
                  </Button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </section>
  );
}
