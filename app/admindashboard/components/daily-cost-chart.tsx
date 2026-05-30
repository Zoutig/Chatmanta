// Admin Dashboard — pure, dependency-vrije staafgrafiek voor dagelijks
// klant-chatbot-verbruik (USD) deze maand. Server-component (geen state/effecten),
// dus geen react-hooks/purity-issues. Leunt op de klant-design-tokens.

import type { ReactNode } from 'react';
import { Card } from '@/app/klantendashboard/components/ui/card';
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
  const max = points.reduce((m, p) => Math.max(m, p.costUsd), 0);
  const hasData = max > 0;
  // Aslabel-dichtheid: bij veel dagen tonen we ~elke 5e dag een dagnummer.
  const labelEvery = points.length > 14 ? 5 : 2;

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div className="klant-section-title">{title}</div>
        <div style={{ fontSize: 13, color: 'var(--klant-muted)' }}>
          Totaal deze maand:{' '}
          <strong style={{ color: 'var(--klant-ink)' }}>{formatCostUsd(totalUsd)}</strong>
        </div>
      </div>

      {!hasData ? (
        <p style={{ fontSize: 13, color: 'var(--klant-dim)', margin: '12px 0 0' }}>
          Nog geen verbruik deze maand.
        </p>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div
            role="img"
            aria-label={`Dagelijks klant-chatbot-verbruik deze maand, totaal ${formatCostUsd(totalUsd)}`}
            style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, width: '100%' }}
          >
            {points.map((p) => {
              // Niet-nul dagen krijgen minimaal 4% hoogte zodat een kleine dag
              // toch zichtbaar is; nul-dagen blijven leeg (transparant).
              const h = p.costUsd > 0 ? Math.max((p.costUsd / max) * 100, 4) : 0;
              return (
                <div
                  key={p.date}
                  title={`${p.dayLabel} — ${formatCostUsd(p.costUsd)}`}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    minHeight: p.costUsd > 0 ? 2 : 0,
                    background: p.costUsd > 0 ? 'var(--klant-accent)' : 'transparent',
                    borderRadius: '3px 3px 0 0',
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
            {points.map((p, i) => (
              <div
                key={p.date}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 10,
                  color: 'var(--klant-dim)',
                  whiteSpace: 'nowrap',
                }}
              >
                {i % labelEvery === 0 ? p.dayLabel : ' '}
              </div>
            ))}
          </div>
        </div>
      )}

      {footnote ? (
        <p style={{ fontSize: 12, color: 'var(--klant-muted)', margin: '10px 0 0' }}>{footnote}</p>
      ) : null}
    </Card>
  );
}
