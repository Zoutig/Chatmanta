import Link from 'next/link';
import {
  LayoutDashboard,
  Library,
  MessageSquareText,
  Settings2,
  Code2,
  MessagesSquare,
  CircleUserRound,
} from 'lucide-react';
import { NavItem } from './nav-item';
import { OrgSwitcher } from './org-switcher';
import type { KnownOrg, OrgSlug } from '@/lib/v0/server/active-org';

export function Sidebar({
  activeOrg,
  orgs,
}: {
  activeOrg: { slug: OrgSlug; name: string };
  orgs: KnownOrg[];
}) {
  return (
    <aside className="klant-sidebar" aria-label="Hoofdnavigatie">
      {/* Brand */}
      <Link
        href="/home"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 6px 14px',
          textDecoration: 'none',
        }}
      >
        <div
          role="img"
          aria-label="ChatManta"
          style={{
            width: 28,
            height: 18,
            backgroundColor: 'var(--manta-accent, #4dd6e8)',
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
            fontSize: 14,
            letterSpacing: '-0.01em',
            color: 'var(--klant-fg)',
          }}
        >
          ChatManta
        </span>
      </Link>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        <NavItem href="/klantendashboard" label="Overzicht" exact>
          <LayoutDashboard size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/kennisbank" label="Kennisbank">
          <Library size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/test" label="Test chatbot">
          <MessageSquareText size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/instellingen" label="Instellingen">
          <Settings2 size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/widget" label="Widget">
          <Code2 size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/gesprekken" label="Gesprekken">
          <MessagesSquare size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/account" label="Account">
          <CircleUserRound size={17} strokeWidth={1.7} />
        </NavItem>
      </nav>

      {/* Org switcher onderaan */}
      <div style={{ marginTop: 'auto', paddingTop: 12 }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--klant-fg-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 6px 6px',
          }}
        >
          Werkomgeving
        </div>
        <OrgSwitcher
          current={activeOrg}
          options={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        />
      </div>
    </aside>
  );
}
