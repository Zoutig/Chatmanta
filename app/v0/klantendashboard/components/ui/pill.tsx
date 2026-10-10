import type { CSSProperties, ReactNode } from 'react';

// Pill — kleine status-badge met tone + optionele dot. Server-component.
// Vervangt de tone-logica van de oude StatusBadge (die wordt een dunne wrapper).

export type PillTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'info';

const TONE: Record<PillTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: 'var(--klant-surface-muted)', fg: 'var(--klant-muted)', border: 'var(--klant-border)' },
  accent: { bg: 'var(--klant-accent-soft)', fg: 'var(--klant-accent)', border: 'var(--klant-accent-border)' },
  success: { bg: 'var(--klant-success-soft)', fg: 'var(--klant-success)', border: 'var(--klant-success-border)' },
  warn: { bg: 'var(--klant-warn-soft)', fg: 'var(--klant-warn)', border: 'var(--klant-warn-border)' },
  danger: { bg: 'var(--klant-danger-soft)', fg: 'var(--klant-danger)', border: 'var(--klant-danger-border)' },
  info: { bg: 'var(--klant-info-soft)', fg: 'var(--klant-info)', border: 'var(--klant-info-border)' },
};

export function Pill({
  tone = 'neutral',
  children,
  dot = false,
  dotted = false,
  style,
}: {
  tone?: PillTone;
  children: ReactNode;
  dot?: boolean;
  dotted?: boolean;
  style?: CSSProperties;
}) {
  const c = TONE[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 9px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 500,
        fontFamily: 'var(--klant-font-body)',
        background: c.bg,
        color: c.fg,
        border: `1px ${dotted ? 'dashed' : 'solid'} ${c.border}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && (
        <span style={{ width: 5, height: 5, borderRadius: 999, background: 'currentColor' }} />
      )}
      {children}
    </span>
  );
}
