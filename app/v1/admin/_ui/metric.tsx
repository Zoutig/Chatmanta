import type { ReactNode } from 'react';

// Cijferkaart voor het admindashboard. Zelfde props als de V0-MetricCard,
// zodat pagina's één-op-één om kunnen. Server component.

export type MetricTone = 'ink' | 'ok' | 'warn' | 'danger' | 'accent';

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="v1-adm-metrics">{children}</div>;
}

export function Metric({
  label,
  value,
  sub,
  tone = 'ink',
  info,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: MetricTone;
  /** Optioneel info-icoon naast het label (uitleg van meer dan één zin). */
  info?: ReactNode;
}) {
  return (
    <div className="v1-adm-metric">
      <span className="v1-adm-metric-label">
        {label}
        {info}
      </span>
      <span className="v1-adm-metric-num" data-tone={tone === 'ink' ? undefined : tone}>
        {value}
      </span>
      {sub ? <span className="v1-adm-metric-sub">{sub}</span> : null}
    </div>
  );
}
