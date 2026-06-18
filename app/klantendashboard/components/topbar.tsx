'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronRight, ExternalLink, Menu, SlidersHorizontal } from 'lucide-react';
import { StatusBadge } from './status-badge';
import { AnimatedThemeToggler } from '@/app/components/ui/animated-theme-toggler';
import { TWEAKS_TOGGLE_EVENT } from './tweaks/tweaks-panel';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';

// Breadcrumb-labels per route. usePathname is client-only — vandaar dat de
// topbar een client-island blijft (zoals voorheen voor de drawer-state).
const SECTION_LABELS: { match: (p: string) => boolean; label: string }[] = [
  { match: (p) => p === '/klantendashboard', label: 'Overzicht' },
  { match: (p) => p.startsWith('/klantendashboard/kennisbank'), label: 'Kennisbank' },
  { match: (p) => p.startsWith('/klantendashboard/test'), label: 'Preview Chatbot' },
  { match: (p) => p.startsWith('/klantendashboard/instellingen'), label: 'Instellingen' },
  { match: (p) => p.startsWith('/klantendashboard/widget'), label: 'Widget' },
  { match: (p) => p.startsWith('/klantendashboard/gesprekken'), label: 'Gesprekken' },
  { match: (p) => p.startsWith('/klantendashboard/account'), label: 'Account' },
];

function sectionLabel(pathname: string): string {
  return SECTION_LABELS.find((s) => s.match(pathname))?.label ?? 'Overzicht';
}

export function Topbar({
  orgName,
  chatbotStatus,
  unansweredCount = 0,
  negativeFeedbackCount = 0,
}: {
  orgName: string;
  chatbotStatus: ChatbotStatus;
  unansweredCount?: number;
  negativeFeedbackCount?: number;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const notifCount = unansweredCount + negativeFeedbackCount;

  const toggleDrawer = (open: boolean) => {
    setDrawerOpen(open);
    if (typeof document !== 'undefined') {
      const shell = document.querySelector('[data-klant-scope]');
      shell?.setAttribute('data-klant-drawer-open', open ? 'true' : 'false');
      document.body.dataset.klantDrawerOpen = open ? 'true' : 'false';
    }
  };

  // Sluit de drawer zodra je naar een andere sectie navigeert. Zonder dit blijft
  // de off-canvas drawer open staan over de nieuwe pagina heen.
  useEffect(() => {
    setDrawerOpen(false);
    if (typeof document !== 'undefined') {
      document
        .querySelector('[data-klant-scope]')
        ?.setAttribute('data-klant-drawer-open', 'false');
      document.body.dataset.klantDrawerOpen = 'false';
    }
  }, [pathname]);

  const openTweaks = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(TWEAKS_TOGGLE_EVENT));
    }
  };

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

        {/* Breadcrumb: actieve org → sectie */}
        <nav
          aria-label="Kruimelpad"
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minWidth: 0 }}
        >
          <span
            className="klant-topbar-label"
            style={{
              color: 'var(--klant-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 180,
            }}
          >
            {orgName}
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
        <span className="klant-topbar-label">
          <StatusBadge status={chatbotStatus} />
        </span>

        {/* Notificaties → onbeantwoord/negatieve feedback */}
        <Link
          href="/klantendashboard/gesprekken?filter=unanswered"
          className="klant-ui-iconbtn"
          style={{ width: 34, height: 34, position: 'relative' }}
          title={
            notifCount > 0
              ? `${notifCount} item(s) die aandacht vragen`
              : 'Geen openstaande items'
          }
          aria-label="Notificaties"
        >
          <Bell size={15} strokeWidth={1.7} />
          {notifCount > 0 && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                minWidth: 15,
                height: 15,
                padding: '0 4px',
                borderRadius: 999,
                background: 'var(--klant-warn)',
                color: 'var(--klant-bg)',
                fontSize: 9.5,
                fontWeight: 700,
                lineHeight: '15px',
                textAlign: 'center',
                fontFamily: 'var(--klant-font-body)',
              }}
            >
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </Link>

        {/* Weergave-opties (modus / accent / dichtheid) */}
        <button
          type="button"
          className="klant-ui-iconbtn"
          style={{ width: 34, height: 34 }}
          onClick={openTweaks}
          title="Weergave-opties"
          aria-label="Weergave-opties"
        >
          <SlidersHorizontal size={15} strokeWidth={1.7} />
        </button>

        <AnimatedThemeToggler />

        <Link
          href="/widget"
          className="klant-ui-btn klant-topbar-preview-btn"
          data-variant="secondary"
          data-size="md"
          title="Open de widget-demo om te zien hoe je chatbot op een website verschijnt"
        >
          <ExternalLink size={14} strokeWidth={1.7} />
          <span>Preview chatbot</span>
        </Link>
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
