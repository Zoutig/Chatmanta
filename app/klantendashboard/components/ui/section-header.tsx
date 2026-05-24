import type { ReactNode } from 'react';

// SectionHeader — titel + optionele subtitel + rechter-actie, boven een
// sectie binnen een Card. Server-component. `level='h2'` voor grotere koppen.

export function SectionHeader({
  title,
  subtitle,
  right,
  level = 'h3',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  level?: 'h2' | 'h3';
}) {
  const fontSize = level === 'h2' ? 18 : 14;
  const fontWeight = level === 'h2' ? 600 : 500;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 10,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: 'var(--klant-font-display)',
            fontSize,
            fontWeight,
            letterSpacing: '-0.01em',
            color: 'var(--klant-ink)',
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--klant-muted)', marginTop: 3 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}
