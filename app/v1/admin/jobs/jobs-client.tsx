'use client';

// V1 admin — crawl-jobs tabel + status-filter + per-rij retry. Data komt serialiseerbaar
// binnen (server bouwt de rijen); deze laag doet alleen filter + de retry-actie.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { adminRetryCrawlAction } from './actions';

export type JobRow = {
  jobId: string;
  orgName: string;
  host: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  errorMessage: string | null;
  createdAt: string;
  lastEvent: string | null;
};

const STATUS_TONE: Record<JobRow['status'], PillTone> = {
  pending: 'neutral',
  processing: 'info',
  completed: 'success',
  failed: 'danger',
};

function fmtWhen(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const selectStyle = {
  fontSize: 13,
  padding: '6px 8px',
  borderRadius: 'var(--klant-r-md)',
  border: '1px solid var(--klant-border)',
  background: 'var(--klant-surface)',
  color: 'var(--klant-ink)',
} as const;

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
      else setError(res.error ?? 'Er ging iets mis.');
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div style={{ fontSize: 13, color: 'var(--klant-danger)', background: 'var(--klant-danger-soft)', borderRadius: 'var(--klant-r-md)', padding: '8px 12px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle} aria-label="Filter op status">
          <option value="all">Alle statussen</option>
          <option value="pending">In afwachting</option>
          <option value="processing">Bezig</option>
          <option value="completed">Voltooid</option>
          <option value="failed">Mislukt</option>
        </select>
        <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>{filtered.length} van {rows.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="klant-empty">
          <p className="klant-empty-title">Geen jobs</p>
          <p className="klant-empty-sub">{rows.length === 0 ? 'Er zijn nog geen crawl-jobs.' : 'Geen jobs met deze status.'}</p>
        </div>
      ) : (
        <div className="klant-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Bron</th>
                <th>Status</th>
                <th>Pogingen</th>
                <th>Laatste event</th>
                <th>Aangemaakt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const terminal = r.status === 'failed' || r.status === 'completed';
                return (
                  <tr key={r.jobId}>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{r.orgName}</td>
                    <td style={{ fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.host ?? ''}>
                      {r.host ?? '—'}
                    </td>
                    <td><Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill></td>
                    <td style={{ fontSize: 12.5 }}>{r.attempts}</td>
                    <td style={{ fontSize: 12.5, color: r.errorMessage ? 'var(--klant-danger)' : 'var(--klant-muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.errorMessage ?? r.lastEvent ?? ''}>
                      {r.errorMessage ?? r.lastEvent ?? '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}>{fmtWhen(r.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="klant-btn"
                        disabled={pending || !terminal}
                        onClick={() => retry(r.jobId)}
                        title={terminal ? 'Start een verse crawl voor deze bron (Firecrawl-credits)' : 'Crawl loopt nog'}
                        style={{ fontSize: 12, padding: '5px 10px' }}
                      >
                        {busy === r.jobId ? 'Starten…' : 'Opnieuw proberen'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
