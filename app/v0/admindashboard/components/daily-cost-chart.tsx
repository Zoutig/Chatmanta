// Admin Dashboard — dagelijks klant-chatbot-verbruik (USD) deze maand.
// Dunne wrapper rond de generieke DailyLineChart: levert alleen de USD-vorm
// (formatter + "totaal deze maand"-label). Server-component, geen chart-library.

import type { ReactNode } from 'react';
import { DailyLineChart } from './daily-line-chart';
import { formatCostUsd } from '@/lib/controlroom/format';
import type { DailyCostPoint } from '@/lib/controlroom/server/usage';

export function DailyCostChart({
  points,
  totalUsd,
  title = 'Klant-chatbot-verbruik per dag (deze maand)',
  footnote,
}: {
  points: DailyCostPoint[];
  totalUsd: number;
  title?: string;
  footnote?: ReactNode;
}) {
  return (
    <DailyLineChart
      points={points.map((p) => ({ date: p.date, label: p.dayLabel, value: p.costUsd }))}
      title={title}
      formatValue={formatCostUsd}
      gradientId="klant-usage-area"
      headerRight={
        <>
          Totaal deze maand:{' '}
          <strong style={{ color: 'var(--klant-ink)' }}>{formatCostUsd(totalUsd)}</strong>
        </>
      }
      emptyText="Nog geen verbruik deze maand."
      ariaLabel={`Lijngrafiek van dagelijks klant-chatbot-verbruik deze maand, totaal ${formatCostUsd(totalUsd)}`}
      footnote={footnote}
    />
  );
}
