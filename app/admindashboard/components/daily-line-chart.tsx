// Admin Dashboard — pure, dependency-vrije dagelijkse lijngrafiek. Server-component
// (geen state/effecten). Eén inline-SVG: area-gevulde lijn met dagpunten, een
// piek-gridlijn en dagnummers op de x-as. Geen chart-library.
//
// Gegeneraliseerd uit daily-cost-chart.tsx zodat zowel het kosten-verbruik
// (USD) als prestatie-trends (bv. weiger-ratio %) dezelfde grafiek delen.
// `formatValue` bepaalt hoe waarden in de tooltip/piek-label getoond worden.

import type { ReactNode } from 'react';
import { Card } from '@/app/klantendashboard/components/ui/card';

export type DailyLinePoint = { date: string; label: string; value: number };

// viewBox-coördinaten (de SVG schaalt mee met de kaartbreedte via width:100%).
const VB_W = 720;
const VB_H = 200;
const PAD_L = 12;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 26;
const INNER_W = VB_W - PAD_L - PAD_R;
const INNER_H = VB_H - PAD_T - PAD_B;
const BASELINE = PAD_T + INNER_H;

export function DailyLineChart({
  points,
  title,
  formatValue,
  headerRight,
  emptyText = 'Nog geen data.',
  peakPrefix = 'piek',
  footnote,
  ariaLabel,
  gradientId = 'klant-line-area',
}: {
  points: DailyLinePoint[];
  title: string;
  /** Formatteert een waarde voor tooltip + piek-label (bv. `(n) => `${n}%``). */
  formatValue: (value: number) => string;
  /** Optionele tekst rechtsboven (bv. "Totaal: $X" of "Gemiddeld Y%"). */
  headerRight?: ReactNode;
  emptyText?: string;
  peakPrefix?: string;
  footnote?: ReactNode;
  ariaLabel?: string;
  /** Uniek id per pagina indien meerdere grafieken naast elkaar staan. */
  gradientId?: string;
}) {
  const max = points.reduce((m, p) => Math.max(m, p.value), 0);
  const hasData = max > 0 && points.length > 0;
  // 15% headroom zodat de piek niet tegen de bovenrand plakt.
  const ceiling = max * 1.15;
  // Aslabel-dichtheid: bij veel dagen tonen we ~elke 5e dag een dagnummer.
  const labelEvery = points.length > 14 ? 5 : 2;

  const n = points.length;
  const xAt = (i: number) =>
    n > 1 ? PAD_L + (i / (n - 1)) * INNER_W : PAD_L + INNER_W / 2;
  const yAt = (v: number) => PAD_T + INNER_H - (v / ceiling) * INNER_H;

  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value), p }));
  const peakY = yAt(max);

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');
  const areaPath = hasData
    ? `M ${coords[0].x.toFixed(1)} ${BASELINE} ` +
      coords.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)} `).join('') +
      `L ${coords[n - 1].x.toFixed(1)} ${BASELINE} Z`
    : '';

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
        {headerRight ? (
          <div style={{ fontSize: 13, color: 'var(--klant-muted)' }}>{headerRight}</div>
        ) : null}
      </div>

      {!hasData ? (
        <p style={{ fontSize: 13, color: 'var(--klant-dim)', margin: '12px 0 0' }}>{emptyText}</p>
      ) : (
        <div
          role="img"
          aria-label={ariaLabel ?? `${title}, piek ${formatValue(max)}`}
          style={{ marginTop: 14, width: '100%' }}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            width="100%"
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--klant-accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--klant-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* piek-gridlijn + label */}
            <line
              x1={PAD_L}
              y1={peakY}
              x2={VB_W - PAD_R}
              y2={peakY}
              stroke="var(--klant-border)"
              strokeWidth={1}
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={VB_W - PAD_R}
              y={peakY - 5}
              textAnchor="end"
              fontSize={11}
              fill="var(--klant-dim)"
            >
              {peakPrefix} {formatValue(max)}
            </text>

            {/* baseline */}
            <line
              x1={PAD_L}
              y1={BASELINE}
              x2={VB_W - PAD_R}
              y2={BASELINE}
              stroke="var(--klant-border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />

            {/* area-vulling + lijn */}
            <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
            <path
              d={linePath}
              fill="none"
              stroke="var(--klant-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {/* dagpunten (alleen niet-nul dagen) met hover-tooltip */}
            {coords.map((c) =>
              c.p.value > 0 ? (
                <circle
                  key={c.p.date}
                  cx={c.x}
                  cy={c.y}
                  r={2.6}
                  fill="var(--klant-accent)"
                  stroke="var(--klant-surface)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{`${c.p.label} — ${formatValue(c.p.value)}`}</title>
                </circle>
              ) : null,
            )}

            {/* dagnummers op de x-as */}
            {coords.map((c, i) =>
              i % labelEvery === 0 ? (
                <text
                  key={`lbl-${c.p.date}`}
                  x={c.x}
                  y={VB_H - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--klant-dim)"
                >
                  {c.p.label}
                </text>
              ) : null,
            )}
          </svg>
        </div>
      )}

      {footnote ? (
        <p style={{ fontSize: 12, color: 'var(--klant-muted)', margin: '10px 0 0' }}>{footnote}</p>
      ) : null}
    </Card>
  );
}
