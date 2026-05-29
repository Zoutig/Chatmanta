// Admin Dashboard — sidebar. Server-component die de herbruikbare NavItem
// (client) rendert. Eigen nav-vocabulaire, maar exact het klantendashboard
// design (klant-sidebar + klant-nav-item).

import Link from 'next/link';
import {
  LayoutDashboard,
  Building2,
  ClipboardList,
  MessagesSquare,
  Library,
  Workflow,
  AlertTriangle,
  BarChart3,
  Settings2,
  ArrowLeft,
} from 'lucide-react';
import { NavItem } from '@/app/klantendashboard/components/nav-item';

export function ControlRoomSidebar() {
  return (
    <aside className="klant-sidebar" aria-label="Hoofdnavigatie">
      {/* Brand */}
      <Link
        href="/admindashboard"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 8px 16px',
          textDecoration: 'none',
        }}
      >
        <div
          role="img"
          aria-label="ChatManta"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'var(--klant-accent-soft)',
            border: '1px solid var(--klant-accent-border)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 18,
              height: 12,
              backgroundColor: 'var(--klant-accent)',
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
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontFamily: 'var(--klant-font-display)',
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '-0.01em',
              color: 'var(--klant-ink)',
            }}
          >
            ChatManta
          </span>
          <span
            style={{
              fontSize: 10.5,
              color: 'var(--klant-dim)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginTop: 1,
            }}
          >
            Admin Dashboard
          </span>
        </div>
      </Link>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, marginTop: 6 }}>
        <NavItem href="/admindashboard" label="Overview" exact>
          <LayoutDashboard size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/admindashboard/klanten" label="Klanten">
          <Building2 size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/admindashboard/onboarding" label="Onboarding">
          <ClipboardList size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/admindashboard/gesprekken" label="Gesprekken">
          <MessagesSquare size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/admindashboard/bronnen" label="Bronnen">
          <Library size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/admindashboard/jobs" label="Crawls & Jobs">
          <Workflow size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/admindashboard/issues" label="Issues">
          <AlertTriangle size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/admindashboard/usage" label="Usage & Kosten">
          <BarChart3 size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/admindashboard/instellingen" label="Instellingen">
          <Settings2 size={17} strokeWidth={1.7} />
        </NavItem>
      </nav>

      {/* Footer — terug naar de andere cockpits */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 12,
          borderTop: '1px solid var(--klant-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Link href="/klantendashboard" className="klant-nav-item">
          <ArrowLeft size={16} strokeWidth={1.7} />
          <span style={{ flex: 1 }}>Klantendashboard</span>
        </Link>
        <Link href="/commandcenter" className="klant-nav-item">
          <ArrowLeft size={16} strokeWidth={1.7} />
          <span style={{ flex: 1 }}>Command Center</span>
        </Link>
      </div>
    </aside>
  );
}
