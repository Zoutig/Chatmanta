'use client';

// Command Center shell — sidebar + topbar wrapper.
// Wordt door layout.tsx als children-container gebruikt. Client-side voor
// active-route highlighting via usePathname.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatedThemeToggler } from '@/app/components/ui/animated-theme-toggler';
import { Icon } from '@/app/components/svg-icons';

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
  { href: '/commandcenter/roadmap', label: 'Roadmap', icon: 'sparkle', status: 'soon' },
  { href: '/commandcenter/milestones', label: 'Milestones', icon: 'check', status: 'soon' },
  { href: '/commandcenter/checkins', label: 'Check-ins', icon: 'refresh', status: 'soon' },
  { href: '/commandcenter/decisions', label: 'Beslissingen', icon: 'edit', status: 'soon' },
  { href: '/commandcenter/customers', label: 'Testklanten', icon: 'monitor', status: 'soon' },
];

export function CommandShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#02060c',
        color: '#eaf6fb',
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 240px) 1fr',
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          position: 'sticky',
          top: 0,
          alignSelf: 'start',
          height: '100vh',
          background: 'rgba(255,255,255,0.025)',
          borderRight: '1px solid rgba(120,200,230,0.10)',
          padding: '22px 16px',
          overflowY: 'auto',
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
            color: '#eaf6fb',
          }}
        >
          <div
            role="img"
            aria-label="ChatManta logo"
            style={{
              width: 28,
              height: 18,
              backgroundColor: 'var(--manta-accent)',
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
                    ? '#eaf6fb'
                    : disabled
                      ? 'rgba(207,232,240,0.36)'
                      : 'rgba(207,232,240,0.72)',
                  background: active
                    ? 'color-mix(in oklab, var(--manta-accent) 14%, transparent)'
                    : 'transparent',
                  border: active
                    ? '1px solid color-mix(in oklab, var(--manta-accent) 30%, transparent)'
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
                      color: 'rgba(155,213,224,0.48)',
                      background: 'rgba(120,200,230,0.06)',
                      border: '1px solid rgba(120,200,230,0.14)',
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
            marginTop: 28,
            paddingTop: 18,
            borderTop: '1px solid rgba(120,200,230,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/home"
            style={{
              color: 'rgba(155,213,224,0.7)',
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
    </div>
  );
}
