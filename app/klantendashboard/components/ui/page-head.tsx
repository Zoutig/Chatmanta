import type { ReactNode } from 'react';

// PageHead — in-page kop (eyebrow + titel + subtitel + acties). Server-
// component. Supersedet de oude PageHeader (die wordt een dunne shim).

export function PageHead({
  title,
  eyebrow,
  subtitle,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 24,
        marginBottom: 22,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--klant-muted)',
              marginBottom: 6,
              letterSpacing: '0.04em',
            }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          style={{
            fontFamily: 'var(--klant-font-display)',
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: '-0.025em',
            margin: 0,
            lineHeight: 1.12,
            color: 'var(--klant-ink)',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: 13.5,
              color: 'var(--klant-muted)',
              margin: '7px 0 0',
              maxWidth: 620,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        // flexShrink:1 + minWidth:0: op smal scherm wrapt het actie-blok naar een
        // eigen regel en krimpt het tot de viewport, zodat de knoppen onderling
        // wrappen i.p.v. de primaire CTA buiten beeld af te knippen. Op desktop is
        // er ruimte zat, dus daar verandert er niets.
        <div style={{ display: 'flex', gap: 8, flexShrink: 1, minWidth: 0, flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
