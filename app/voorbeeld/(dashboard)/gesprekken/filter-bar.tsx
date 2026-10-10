'use client';

// Eén filterregel boven de gesprekkenlijst (spec 7.3): periode, schakelaar
// "Alleen onbeantwoord" met teller, en rechts een ⋯-menu met CSV-export en
// Herladen. Filters staan in de URL (?filter=<periode>&unanswered=1), zodat een
// gefilterde lijst deelbaar blijft. De oude link ?filter=unanswered blijft werken
// (page.tsx vertaalt die naar 30 dagen + alleen onbeantwoord).
//
// Optimistisch: de gekozen periode/schakelaar staat meteen goed terwijl de
// server de nieuwe lijst rendert.
//
// Voorbeeld: er is geen export-route; "Exporteer CSV" bouwt het bestand in de
// browser uit de gesprekken die nu in de lijst staan.

import { useEffect, useId, useOptimistic, useRef, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, RefreshCw } from 'lucide-react';
import { Segmented } from '@/app/v1/_ui/controls';
import { Menu } from '@/app/v1/_ui/menu';
import { Badge } from '@/app/v1/_ui/feedback';
import { useToast } from '@/app/v1/_ui/toast';
import type { V1ConversationListItem } from '@/lib/v1/dashboard/conversations';

export type Period = 'today' | 'last_7_days' | 'last_30_days';

const PERIODS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: 'today', label: 'Vandaag' },
  { value: 'last_7_days', label: '7 dagen' },
  { value: 'last_30_days', label: '30 dagen' },
];

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV in de browser bouwen en downloaden (puntkomma: opent goed in Nederlandse Excel). */
function downloadCsv(rows: V1ConversationListItem[]): void {
  const lines = [
    ['Gesprek-ID', 'Eerste vraag', 'Berichten', 'Laatste bericht', 'Onbeantwoord'].join(';'),
    ...rows.map((r) =>
      [r.id, r.firstQuestion, r.messageCount, r.lastMessageAt, r.unanswered ? 'ja' : 'nee'].map(csvCell).join(';'),
    ),
  ];
  const blob = new Blob([String.fromCharCode(0xfeff) + lines.join(String.fromCharCode(13, 10))], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gesprekken-duinhoeve.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FilterBar({
  period,
  onlyUnanswered,
  unansweredCount,
  exportRows = [],
}: {
  period: Period;
  onlyUnanswered: boolean;
  unansweredCount: number;
  /** Gesprekken die nu in de lijst staan (voor de CSV-export). */
  exportRows?: V1ConversationListItem[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const switchId = useId();
  const [, startNav] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [opt, setOpt] = useOptimistic({ period, onlyUnanswered });

  function go(next: { period: Period; onlyUnanswered: boolean }) {
    const p = new URLSearchParams(params);
    p.set('filter', next.period);
    if (next.onlyUnanswered) p.set('unanswered', '1');
    else p.delete('unanswered');
    startNav(() => {
      setOpt(next);
      router.push(`/voorbeeld/gesprekken?${p.toString()}`, { scroll: false });
    });
  }

  // Bevestiging zodra het herladen klaar is.
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (refreshing) {
      wasRefreshing.current = true;
    } else if (wasRefreshing.current) {
      wasRefreshing.current = false;
      toast.success('Gesprekken bijgewerkt');
    }
  }, [refreshing, toast]);

  return (
    <div className="v1-toolbar">
      <Segmented
        label="Periode"
        value={opt.period}
        options={PERIODS}
        onChange={(v) => go({ ...opt, period: v })}
      />

      <div className="v1-gs-switch">
        <button
          id={switchId}
          type="button"
          role="switch"
          aria-checked={opt.onlyUnanswered}
          className="v1-switch"
          onClick={() => go({ ...opt, onlyUnanswered: !opt.onlyUnanswered })}
        />
        <label htmlFor={switchId}>
          Alleen onbeantwoord
          <Badge tone={unansweredCount > 0 ? 'warn' : 'neutral'}>{unansweredCount}</Badge>
        </label>
      </div>

      <div className="v1-toolbar-end">
        <Menu
          label="Meer acties"
          items={[
            {
              label: 'Exporteer CSV',
              onSelect: () => downloadCsv(exportRows),
              icon: <Download size={16} strokeWidth={1.8} aria-hidden="true" />,
            },
            {
              label: refreshing ? 'Herladen…' : 'Herladen',
              icon: <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />,
              disabled: refreshing,
              onSelect: () => startRefresh(() => router.refresh()),
            },
          ]}
        />
      </div>
    </div>
  );
}
