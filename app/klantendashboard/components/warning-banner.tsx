import Link from 'next/link';
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

type Variant = 'warning' | 'info' | 'success';

export function WarningBanner({
  variant = 'warning',
  title,
  message,
  cta,
}: {
  variant?: Variant;
  title: string;
  message: string;
  cta?: { label: string; href: string };
}) {
  const cfg = {
    warning: {
      Icon: AlertTriangle,
      bg: 'var(--klant-warning-soft)',
      border: 'rgba(251, 191, 36, 0.32)',
      color: 'var(--klant-warning)',
    },
    info: {
      Icon: Info,
      bg: 'var(--klant-info-soft)',
      border: 'rgba(96, 165, 250, 0.32)',
      color: 'var(--klant-info)',
    },
    success: {
      Icon: CheckCircle2,
      bg: 'var(--klant-success-soft)',
      border: 'rgba(52, 211, 153, 0.32)',
      color: 'var(--klant-success)',
    },
  }[variant];

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        padding: '14px 16px',
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 'var(--klant-r-md)',
        alignItems: 'flex-start',
      }}
      role={variant === 'warning' ? 'alert' : 'note'}
    >
      <div style={{ color: cfg.color, marginTop: 2, flexShrink: 0 }}>
        <cfg.Icon size={18} strokeWidth={1.8} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--klant-fg)',
            marginBottom: 2,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--klant-fg-muted)', lineHeight: 1.5 }}>{message}</div>
      </div>
      {cta && (
        <Link
          href={cta.href}
          className="klant-btn"
          style={{
            textDecoration: 'none',
            flexShrink: 0,
            background: 'var(--klant-bg-elev)',
          }}
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
