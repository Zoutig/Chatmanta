'use client';

// V1 admin — Gesprekken-lijst met zoek/datumfilter (client, server-action-driven).
// Ontvangt de ongefilterde eerste-50 van GesprekkenTab als startpunt; een zoek-
// opdracht roept searchAdminThreadsAction() aan en vervangt de lijst in state.

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, buttonClass } from '@/app/v1/_ui/button';
import { Badge, EmptyState } from '@/app/v1/_ui/feedback';
import { DataTable, NumCell } from '@/app/v1/admin/_ui/data-table';
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
    <section className="v1-card">
      <div className="v1-adm-card-head">
        <h2 className="v1-section-title">Gesprekken</h2>
      </div>

      <form onSubmit={runSearch} className="v1-adm-search" style={{ marginBottom: 14 }}>
        <input
          className="v1-input"
          type="search"
          placeholder="Zoek in berichten"
          aria-label="Zoek in berichten"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 200px', minWidth: 0 }}
        />
        <input
          className="v1-input"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="Vanaf datum"
          title="Vanaf"
          style={{ flex: '0 1 160px', minWidth: 0 }}
        />
        <input
          className="v1-input"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Tot en met datum"
          title="Tot en met"
          style={{ flex: '0 1 160px', minWidth: 0 }}
        />
        <Button type="submit" variant="primary" loading={pending}>
          Zoeken
        </Button>
        {filterActive && (
          <Button type="button" variant="ghost" onClick={reset} disabled={pending}>
            Wissen
          </Button>
        )}
      </form>

      {error && <p className="v1-alert v1-alert--error">{error}</p>}

      {threads.length === 0 ? (
        <EmptyState>
          {filterActive ? 'Geen gesprekken gevonden voor deze zoekopdracht.' : 'Nog geen gesprekken voor deze organisatie.'}
        </EmptyState>
      ) : (
        <DataTable
          label="Gesprekken"
          columns={[
            { label: 'Laatste activiteit' },
            { label: 'Eerste vraag' },
            { label: 'Berichten', num: true },
            { label: 'Status' },
            { label: <span className="v1-sr-only">Actie</span>, width: '1%' },
          ]}
        >
          {threads.map((t) => {
            const href = `/v1/admin/organizations/${orgId}/gesprek/${t.id}`;
            return (
              <tr key={t.id}>
                <td className="v1-adm-muted" style={{ whiteSpace: 'nowrap' }}>
                  {fmtRelative(t.lastMessageAt)}
                </td>
                <td>
                  <Link href={href} className="v1-adm-clip">
                    {t.firstQuestion}
                  </Link>
                </td>
                <NumCell>{t.messageCount}</NumCell>
                <td>
                  {t.unanswered ? <Badge tone="warn">Onbeantwoord</Badge> : <Badge>Beantwoord</Badge>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Link href={href} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                    Bekijken
                  </Link>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </section>
  );
}
