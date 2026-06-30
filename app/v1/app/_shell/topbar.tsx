'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronRight, Menu } from 'lucide-react';
import { AnimatedThemeToggler } from '@/app/components/ui/animated-theme-toggler';

// Breadcrumb-labels per route. usePathname is client-only → de topbar is een
// client-island (zoals V0), óók voor de drawer-state.
const SECTION_LABELS: { match: (p: string) => boolean; label: string }[] = [
  { match: (p) => p === '/v1/app', label: 'Chatbot' },
  { match: (p) => p.startsWith('/v1/app/kennisbank'), label: 'Kennisbank' },
  { match: (p) => p.startsWith('/v1/app/instellingen'), label: 'Instellingen' },
  { match: (p) => p.startsWith('/v1/app/account'), label: 'Account' },
];

function sectionLabel(pathname: string): string {
  return SECTION_LABELS.find((s) => s.match(pathname))?.label ?? 'Chatbot';
}

export function V1Topbar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Drawer-toggle: zet data-klant-drawer-open op het [data-klant-scope]-element
  // (klant.css' off-canvas-mechanisme onder ≤900px). Gekopieerd uit V0-topbar.
  const toggleDrawer = (open: boolean) => {
    setDrawerOpen(open);
    if (typeof document !== 'undefined') {
      const shell = document.querySelector('[data-klant-scope]');
      shell?.setAttribute('data-klant-drawer-open', open ? 'true' : 'false');
      document.body.dataset.klantDrawerOpen = open ? 'true' : 'false';
    }
  };

  // Sluit de drawer bij navigatie naar een andere sectie.
  useEffect(() => {
    setDrawerOpen(false);
    if (typeof document !== 'undefined') {
      document
        .querySelector('[data-klant-scope]')
        ?.setAttribute('data-klant-drawer-open', 'false');
      document.body.dataset.klantDrawerOpen = 'false';
    }
  }, [pathname]);

  return (
    <header className="klant-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <button
          type="button"
          aria-label="Menu openen"
          title="Menu"
          className="klant-topbar-hamburger topbar-hamburger"
          onClick={() => toggleDrawer(true)}
        >
          <Menu size={18} strokeWidth={1.7} />
        </button>

        <nav
          aria-label="Kruimelpad"
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minWidth: 0 }}
        >
          <span
            className="klant-topbar-label"
            style={{ color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}
          >
            Klantendashboard
          </span>
          <ChevronRight
            size={14}
            strokeWidth={1.7}
            className="klant-topbar-label"
            style={{ color: 'var(--klant-dim)', flexShrink: 0 }}
          />
          <span
            style={{
              fontFamily: 'var(--klant-font-display)',
              fontWeight: 600,
              color: 'var(--klant-ink)',
              whiteSpace: 'nowrap',
            }}
          >
            {sectionLabel(pathname)}
          </span>
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AnimatedThemeToggler />
      </div>

      {drawerOpen ? (
        <button
          type="button"
          aria-label="Sluit menu"
          className="drawer-backdrop"
          onClick={() => toggleDrawer(false)}
        />
      ) : null}
    </header>
  );
}
