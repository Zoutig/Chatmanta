'use client';

// Toggle tussen het admin Widget-config scherm en de live demo-widget.
// Mount-puntje:
//   - /klantendashboard/widget → PageHeader action-slot (variant="dashboard")
//   - /widget/[slug]/[page]   → WidgetShell demo-bar    (variant="demo-chrome")
//
// Inline styles (per AGENTS-tailwind-quirk): nieuwe class-based selectors in
// klant.css worden door de Tailwind v4 PostCSS-pipeline soms silent gedropt.

import Link from 'next/link';

type Current = 'dashboard' | 'widget';
type Variant = 'dashboard' | 'demo-chrome';

const TARGETS: Record<Current, string> = {
  dashboard: '/klantendashboard/widget',
  widget: '/widget',
};

const LABELS: Record<Current, string> = {
  dashboard: 'Klantendashboard',
  widget: 'Widget',
};

export function DashboardWidgetSwitch({
  current,
  variant,
}: {
  current: Current;
  variant: Variant;
}) {
  const segments: Current[] = ['dashboard', 'widget'];
  const styles = variant === 'dashboard' ? DASHBOARD_STYLES : DEMO_CHROME_STYLES;

  return (
    <nav
      aria-label="Wissel tussen klantendashboard en widget"
      style={styles.wrap}
    >
      {segments.map((seg) => {
        const isActive = seg === current;
        const label = LABELS[seg];
        if (isActive) {
          return (
            <span
              key={seg}
              aria-current="page"
              style={{ ...styles.segment, ...styles.active }}
            >
              {label}
            </span>
          );
        }
        return (
          <Link
            key={seg}
            href={TARGETS[seg]}
            style={{ ...styles.segment, ...styles.inactive }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Dashboard-variant (past in PageHeader action-slot, theme-aware) ───────

const DASHBOARD_STYLES = {
  wrap: {
    display: 'inline-flex',
    padding: 3,
    gap: 2,
    background: 'var(--klant-surface)',
    border: '1px solid var(--klant-border)',
    borderRadius: 999,
  } as React.CSSProperties,
  segment: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 999,
    textDecoration: 'none',
    fontFamily: 'inherit',
    transition: 'background 120ms, color 120ms',
    lineHeight: 1.2,
  } as React.CSSProperties,
  active: {
    background: 'var(--klant-bg-elev)',
    color: 'var(--klant-fg)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    cursor: 'default',
  } as React.CSSProperties,
  inactive: {
    background: 'transparent',
    color: 'var(--klant-fg-muted)',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ─── Demo-chrome-variant (past in WidgetShell glass demo-bar) ──────────────

const DEMO_CHROME_STYLES = {
  wrap: {
    display: 'inline-flex',
    padding: 2,
    gap: 2,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(120,200,230,0.22)',
    borderRadius: 999,
  } as React.CSSProperties,
  segment: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 12px',
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 999,
    textDecoration: 'none',
    fontFamily: 'inherit',
    transition: 'background 120ms, color 120ms',
    lineHeight: 1.2,
  } as React.CSSProperties,
  active: {
    background: 'rgba(120,200,230,0.18)',
    color: '#eaf6fb',
    cursor: 'default',
  } as React.CSSProperties,
  inactive: {
    background: 'transparent',
    color: 'rgba(155,213,224,0.75)',
    cursor: 'pointer',
  } as React.CSSProperties,
};
