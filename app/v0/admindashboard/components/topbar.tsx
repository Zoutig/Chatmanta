'use client';

// Admin Dashboard — topbar (client island).
//
// Anders dan het klantendashboard had de admin-layout alleen een server-header
// zonder drawer-besturing. Daardoor was de sidebar op telefoon (≤640px, waar
// klant.css de sidebar off-canvas zet) niet te openen: geen hamburger, geen
// toggle. Deze client-topbar voegt de hamburger + drawer-toggle + backdrop toe
// en hergebruikt exact het bestaande klant-scope drawer-mechanisme:
// `data-klant-drawer-open` op [data-klant-scope] + de `.drawer-backdrop`,
// beide al gestyled in klant.css / globals.css.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

function setDrawerAttr(open: boolean) {
  if (typeof document === 'undefined') return;
  const shell = document.querySelector('[data-klant-scope]');
  shell?.setAttribute('data-klant-drawer-open', open ? 'true' : 'false');
  document.body.dataset.klantDrawerOpen = open ? 'true' : 'false';
}

export function ControlRoomTopbar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = (open: boolean) => {
    setDrawerOpen(open);
    setDrawerAttr(open);
  };

  // Sluit de drawer zodra je naar een andere sectie navigeert (tik op nav-item
  // → route wisselt → drawer dicht). Zonder dit blijft de drawer open over de
  // nieuwe pagina heen staan.
  useEffect(() => {
    setDrawerOpen(false);
    setDrawerAttr(false);
  }, [pathname]);

  return (
    <header className="klant-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button
          type="button"
          aria-label="Menu openen"
          title="Menu"
          className="klant-topbar-hamburger topbar-hamburger"
          onClick={() => toggleDrawer(true)}
        >
          <Menu size={18} strokeWidth={1.7} />
        </button>
        <span
          style={{
            fontFamily: 'var(--klant-font-display)',
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--klant-ink)',
            whiteSpace: 'nowrap',
          }}
        >
          Admin Dashboard
        </span>
        {/* Eerlijke disclaimer: V0 is gedeeld-wachtwoord, geen per-user authz. */}
        <span className="klant-status" data-tone="warning">
          Interne tooling
        </span>
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
