import Link from 'next/link';
import {
  LayoutDashboard,
  Library,
  MessageSquareText,
  Settings2,
  Code2,
  MessagesSquare,
  CircleUserRound,
  MessageSquarePlus,
} from 'lucide-react';
import { NavItem } from './nav-item';
import { OrgSwitcher } from './org-switcher';
import { SearchTrigger } from './shell/search-trigger';
import type { KnownOrg, OrgSlug } from '@/lib/v0/server/active-org';

export function Sidebar({
  activeOrg,
  orgs,
  unansweredCount = 0,
}: {
  activeOrg: { slug: OrgSlug; name: string };
  orgs: KnownOrg[];
  /** Onbeantwoorde vragen → badge op Gesprekken. */
  unansweredCount?: number;
}) {
  return (
    <aside className="klant-sidebar" aria-label="Hoofdnavigatie">
      {/* Brand */}
      <Link
        href="/home"
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
            Klantendashboard
          </span>
        </div>
      </Link>

      <SearchTrigger />

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, marginTop: 6 }}>
        <NavItem href="/klantendashboard" label="Overzicht" exact>
          <LayoutDashboard size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/kennisbank" label="Kennisbank">
          <Library size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/test" label="Preview Chatbot">
          <MessageSquareText size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/instellingen" label="Instellingen">
          <Settings2 size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/widget" label="Widget">
          <Code2 size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/gesprekken" label="Gesprekken" badge={unansweredCount}>
          <MessagesSquare size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/account" label="Account">
          <CircleUserRound size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/klantendashboard/feedback" label="Feedback">
          <MessageSquarePlus size={17} strokeWidth={1.7} />
        </NavItem>
      </nav>

      {/* Org switcher onderaan */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 12,
          borderTop: '1px solid var(--klant-border)',
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--klant-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            margin: '0 6px 8px',
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
