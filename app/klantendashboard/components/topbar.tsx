'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Menu } from 'lucide-react';
import { StatusBadge } from './status-badge';
import { AnimatedThemeToggler } from '@/app/components/ui/animated-theme-toggler';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';

export function Topbar({
  orgName,
  chatbotStatus,
}: {
  orgName: string;
  chatbotStatus: ChatbotStatus;
}) {
  // Mobile-drawer state. Toggelt data-attr op de .klant-shell-wrapper en op
  // body — CSS leest dit en slidet de sidebar in/uit. State zit hier omdat de
  // hamburger hier woont; sidebar/shell zijn server-components zonder state.
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = (open: boolean) => {
    setDrawerOpen(open);
    if (typeof document !== 'undefined') {
      const shell = document.querySelector('[data-klant-scope]');
      shell?.setAttribute('data-klant-drawer-open', open ? 'true' : 'false');
      document.body.dataset.klantDrawerOpen = open ? 'true' : 'false';
    }
  };

  return (
    <header className="klant-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            fontSize: 13,
            color: 'var(--klant-fg-muted)',
          }}
          className="klant-topbar-label"
        >
          Workspace
        </span>
        <span
          style={{
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--klant-fg)',
          }}
        >
          {orgName}
        </span>
        <StatusBadge status={chatbotStatus} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link
          href="/widget"
          className="klant-btn klant-topbar-preview-btn"
          style={{ textDecoration: 'none' }}
          title="Open de widget-demo om te zien hoe je chatbot op een website verschijnt"
        >
          <ExternalLink size={14} strokeWidth={1.7} />
          <span>Preview chatbot</span>
        </Link>
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
