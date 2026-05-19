'use client';

// Command Center shell — sidebar + topbar wrapper.
// Wordt door layout.tsx als children-container gebruikt. Client-side voor
// active-route highlighting via usePathname.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatedThemeToggler } from '@/app/components/ui/animated-theme-toggler';
import { Icon } from '@/app/components/svg-icons';
import { AssistantPanel } from './assistant-panel';

type IconName = Parameters<typeof Icon>[0]['name'];

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  status?: 'live' | 'soon';
};

const NAV: NavItem[] = [
  { href: '/commandcenter', label: 'Dashboard', icon: 'command', status: 'live' },
  { href: '/commandcenter/tasks', label: 'Taken', icon: 'list', status: 'live' },
  { href: '/commandcenter/completed', label: 'Voltooid', icon: 'check', status: 'live' },
  { href: '/commandcenter/roadmap', label: 'Roadmap', icon: 'sparkle', status: 'live' },
  { href: '/commandcenter/milestones', label: 'Milestones', icon: 'check', status: 'live' },
  { href: '/commandcenter/checkins', label: 'Check-ins', icon: 'refresh', status: 'live' },
  { href: '/commandcenter/decisions', label: 'Beslissingen', icon: 'edit', status: 'live' },
  { href: '/commandcenter/customers', label: 'Testklanten', icon: 'monitor', status: 'live' },
  { href: '/commandcenter/projects', label: 'Projectgebieden', icon: 'folder', status: 'live' },
];

// Accent met fallback: --manta-accent is opt-in (alleen actief onder data-style="glass"),
// dus binnen Command Center pakken we --accent als die niet gezet is.
const ACCENT = 'var(--manta-accent, var(--accent))';

export function CommandShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--fg)',
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 240px) minmax(0, 1fr) auto',
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          position: 'sticky',
          top: 0,
          alignSelf: 'start',
          height: '100vh',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          padding: '22px 16px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Link
          href="/home"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 26,
            textDecoration: 'none',
            color: 'var(--fg)',
          }}
        >
          <div
            role="img"
            aria-label="ChatManta logo"
            style={{
              width: 28,
              height: 18,
              backgroundColor: ACCENT,
              WebkitMaskImage: "url('/logo/mono-mark.png')",
              maskImage: "url('/logo/mono-mark.png')",
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '-0.01em',
            }}
          >
            Command Center
          </span>
        </Link>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map((item) => {
            const active =
              item.status === 'live' &&
              (pathname === item.href ||
                (item.href !== '/commandcenter' && pathname.startsWith(item.href)));
            const disabled = item.status === 'soon';
            const inner = (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: active
                    ? 'var(--fg)'
                    : disabled
                      ? 'var(--fg-faint)'
                      : 'var(--fg-muted)',
                  background: active
                    ? `color-mix(in oklab, ${ACCENT} 14%, transparent)`
                    : 'transparent',
                  border: active
                    ? `1px solid color-mix(in oklab, ${ACCENT} 30%, transparent)`
                    : '1px solid transparent',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                <Icon name={item.icon} size={15} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {disabled && (
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--fg-faint)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 999,
                      padding: '2px 6px',
                    }}
                  >
                    Soon
                  </span>
                )}
              </span>
            );
            if (disabled) {
              return (
                <div key={item.href} aria-disabled="true">
                  {inner}
                </div>
              );
            }
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                {inner}
              </Link>
            );
          })}
        </nav>

        <div
          style={{
            marginTop: 'auto',
            paddingTop: 18,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/home"
            style={{
              color: 'var(--fg-muted)',
              fontSize: 12,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="caret" size={12} className="rotate-90" />
            Terug naar hub
          </Link>
          <AnimatedThemeToggler />
        </div>
      </aside>

      {/* Main */}
      <main style={{ padding: '28px 36px 64px', maxWidth: 1280, width: '100%' }}>
        {children}
      </main>

      {/* Right-side assistant panel */}
      <AssistantPanel />
    </div>
  );
}
