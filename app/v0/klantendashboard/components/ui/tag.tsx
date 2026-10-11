import type { CSSProperties, ReactNode } from 'react';

// Tag — kleine, lowercase categorie-chip. Server-component.

export function Tag({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 7px',
        borderRadius: 5,
        fontSize: 10.5,
        fontWeight: 500,
        fontFamily: 'var(--klant-font-body)',
        background: 'var(--klant-surface-muted)',
        color: 'var(--klant-muted)',
        border: '1px solid var(--klant-border)',
        textTransform: 'lowercase',
        letterSpacing: '0.02em',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
