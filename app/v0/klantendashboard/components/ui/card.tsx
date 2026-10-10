import type { HTMLAttributes } from 'react';

// Card — generieke surface met density-aware padding. Server-component.
// `padded` aan → padding via --klant-pad-*; uit voor tabellen/lijsten die hun
// eigen rij-padding doen. `muted` → surface-muted i.p.v. surface.

type CardProps = {
  padded?: boolean;
  muted?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function Card({ padded = true, muted = false, style, children, ...rest }: CardProps) {
  return (
    <div
      style={{
        background: muted ? 'var(--klant-surface-muted)' : 'var(--klant-surface)',
        border: '1px solid var(--klant-border)',
        borderRadius: 'var(--klant-r-lg)',
        boxShadow: 'var(--klant-shadow)',
        ...(padded ? { padding: 'var(--klant-pad-y) var(--klant-pad-x)' } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
