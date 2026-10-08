'use client';

// Eén filterregel boven de gesprekkenlijst (spec 7.3): periode, schakelaar
// "Alleen onbeantwoord" met teller, en rechts een ⋯-menu met CSV-export en
// Herladen. Filters staan in de URL (?filter=<periode>&unanswered=1), zodat een
// gefilterde lijst deelbaar blijft. De oude link ?filter=unanswered blijft werken
// (page.tsx vertaalt die naar 30 dagen + alleen onbeantwoord).
//
// Optimistisch: de gekozen periode/schakelaar staat meteen goed terwijl de
// server de nieuwe lijst rendert.

import { useEffect, useId, useOptimistic, useRef, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, RefreshCw } from 'lucide-react';
import { Segmented } from '@/app/v1/_ui/controls';
import { Menu } from '@/app/v1/_ui/menu';
import { Badge } from '@/app/v1/_ui/feedback';
import { useToast } from '@/app/v1/_ui/toast';

export type Period = 'today' | 'last_7_days' | 'last_30_days';

const PERIODS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: 'today', label: 'Vandaag' },
  { value: 'last_7_days', label: '7 dagen' },
  { value: 'last_30_days', label: '30 dagen' },
];

export function FilterBar({
  period,
  onlyUnanswered,
  unansweredCount,
}: {
  period: Period;
  onlyUnanswered: boolean;
  unansweredCount: number;
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
      router.push(`/v1/app/gesprekken?${p.toString()}`, { scroll: false });
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
              href: '/v1/app/gesprekken/export',
              download: true,
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
