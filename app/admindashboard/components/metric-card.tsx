// Admin Dashboard — kleine stat-kaart voor de Overview-kaartenrij.
// Server-component, leunt op de klant-design tokens + Card-primitive.

import type { ReactNode } from 'react';
import { Card } from '@/app/klantendashboard/components/ui/card';

type Tone = 'ink' | 'success' | 'warn' | 'danger' | 'info';

const TONE_COLOR: Record<Tone, string> = {
  ink: 'var(--klant-ink)',
  success: 'var(--klant-success)',
  warn: 'var(--klant-warn)',
  danger: 'var(--klant-danger)',
  info: 'var(--klant-info)',
};

export function MetricCard({
  label,
  value,
  sub,
  tone = 'ink',
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <Card>
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--klant-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          fontFamily: 'var(--klant-font-display)',
          color: TONE_COLOR[tone],
          marginTop: 6,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: 12.5, color: 'var(--klant-muted)', marginTop: 4 }}>{sub}</div>
      ) : null}
    </Card>
  );
}
