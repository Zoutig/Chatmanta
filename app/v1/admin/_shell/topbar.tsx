'use client';

// V1 Admin Dashboard — topbar (client island).
//
// Geport van V0 ControlRoomTopbar. De sidebar is op telefoon (≤640px) off-canvas
// (klant.css). Zonder hamburger is die dan niet te bereiken. Deze topbar voegt de
// hamburger + drawer-toggle + backdrop toe via het bestaande klant-scope mechanisme:
// `data-klant-drawer-open` op [data-klant-scope] + `.drawer-backdrop` — beide al
// gestyled in klant.css / globals.css.
//
// Geen hrefs aanwezig in de topbar; geen reload-knop (zit niet in het V0-origineel).

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

function setDrawerAttr(open: boolean) {
  if (typeof document === 'undefined') return;
  const shell = document.querySelector('[data-klant-scope]');
  shell?.setAttribute('data-klant-drawer-open', open ? 'true' : 'false');
  document.body.dataset.klantDrawerOpen = open ? 'true' : 'false';
}

export function AdminTopbar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = (open: boolean) => {
    setDrawerOpen(open);
    setDrawerAttr(open);
  };

  // Sluit de drawer bij navigatie (tik op nav-item → route wisselt → drawer dicht).
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
