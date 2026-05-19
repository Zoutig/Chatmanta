import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

export function MetricCard({
  title,
  primary,
  secondary,
  icon: Icon,
  href,
  cta,
  tone = 'neutral',
}: {
  title: string;
  primary: string;
  secondary?: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
  cta?: string;
  tone?: 'neutral' | 'accent' | 'warning' | 'success';
}) {
  const accentBg =
    tone === 'accent'
      ? 'var(--klant-accent-soft)'
      : tone === 'warning'
        ? 'var(--klant-warning-soft)'
        : tone === 'success'
          ? 'var(--klant-success-soft)'
          : 'var(--klant-surface)';
  const accentColor =
    tone === 'accent'
      ? 'var(--klant-accent)'
      : tone === 'warning'
        ? 'var(--klant-warning)'
        : tone === 'success'
          ? 'var(--klant-success)'
          : 'var(--klant-fg-muted)';

  return (
    <div
      className="klant-card"
      style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--klant-fg-muted)',
            letterSpacing: '0.01em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </div>
        {Icon && (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--klant-r-md)',
              background: accentBg,
              color: accentColor,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon size={16} strokeWidth={1.7} />
          </div>
        )}
      </div>

      <div
        style={{
          fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: 'var(--klant-fg)',
          lineHeight: 1.1,
        }}
      >
        {primary}
      </div>

      {secondary && (
        <div style={{ fontSize: 13, color: 'var(--klant-fg-muted)', lineHeight: 1.4 }}>
          {secondary}
        </div>
      )}

      {href && (
        <Link
          href={href}
          className="klant-btn"
          data-variant="ghost"
          style={{
            marginTop: 'auto',
            alignSelf: 'flex-start',
            padding: '6px 10px',
            color: 'var(--klant-accent)',
            textDecoration: 'none',
          }}
        >
          {cta ?? 'Bekijken'}
          <ArrowUpRight size={13} strokeWidth={1.8} />
        </Link>
      )}
    </div>
  );
}
