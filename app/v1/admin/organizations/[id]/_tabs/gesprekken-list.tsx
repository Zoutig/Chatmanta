'use client';

// V1 admin — Gesprekken-lijst met zoek/datumfilter (client, server-action-driven).
// Ontvangt de ongefilterde eerste-50 van GesprekkenTab als startpunt; een zoek-
// opdracht roept searchAdminThreadsAction() aan en vervangt de lijst in state.

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { searchAdminThreadsAction } from './gesprekken-actions';
import type { V1AdminThread } from '@/lib/v1/admin/klant-detail';

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'dag' : 'dagen'} geleden`;
}

const dim = { fontSize: 12, color: 'var(--klant-muted)' } as const;

export function GesprekkenList({
  orgId,
  initialThreads,
}: {
  orgId: string;
  initialThreads: V1AdminThread[];
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const filterActive = search.trim() !== '' || from !== '' || to !== '';

  function runSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await searchAdminThreadsAction(orgId, {
        search: search.trim() || undefined,
        fromIso: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined,
        toIso: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
      });
      if (res.ok) setThreads(res.threads);
      else setError(res.error);
    });
  }

  function reset() {
    setSearch('');
    setFrom('');
    setTo('');
    setError(null);
    setThreads(initialThreads);
  }

  return (
    <>
      <form
        onSubmit={runSearch}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}
      >
        <input
          className="klant-input"
          placeholder="Zoek in berichten…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <input
          className="klant-input"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          title="Vanaf"
          style={{ width: 150 }}
        />
        <input
          className="klant-input"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          title="Tot"
          style={{ width: 150 }}
        />
        <button type="submit" className="klant-btn" data-variant="primary" disabled={pending}>
          {pending ? 'Zoeken…' : 'Zoeken'}
        </button>
        {filterActive && (
          <button type="button" className="klant-btn" data-variant="ghost" onClick={reset} disabled={pending}>
            Wissen
          </button>
        )}
      </form>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--klant-danger)', marginBottom: 12 }}>{error}</p>
      )}

      {threads.length === 0 ? (
        <Card>
          <p style={dim}>
            {filterActive ? 'Geen gesprekken gevonden voor deze zoekopdracht.' : 'Nog geen gesprekken voor deze organisatie.'}
          </p>
        </Card>
      ) : (
        <Card padded={false}>
          <div style={{ overflowX: 'auto' }}>
            <table className="klant-table">
              <thead>
                <tr>
                  <th>Laatste activiteit</th>
                  <th>Eerste vraag</th>
                  <th>Berichten</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {threads.map((t) => (
                  <tr key={t.id}>
                    <td style={{ ...dim, whiteSpace: 'nowrap' }}>{fmtRelative(t.lastMessageAt)}</td>
                    <td style={{ fontSize: 13, maxWidth: 400 }}>
                      <Link
                        href={`/v1/admin/organizations/${orgId}/gesprek/${t.id}`}
                        style={{ color: 'var(--klant-ink)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {t.firstQuestion}
                      </Link>
                    </td>
                    <td style={{ fontSize: 13 }}>{t.messageCount}</td>
                    <td>
                      {t.unanswered ? (
                        <span style={{ fontSize: 12, color: 'var(--klant-warn)', fontWeight: 500 }}>Onbeantwoord</span>
                      ) : (
                        <span style={{ ...dim }}>Beantwoord</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/v1/admin/organizations/${orgId}/gesprek/${t.id}`}
                        className="klant-btn"
                        data-variant="ghost"
                        style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
                      >
                        Bekijk →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
