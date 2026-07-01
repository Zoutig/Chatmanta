import Link from 'next/link';
import {
  LayoutDashboard,
  Library,
  MessageSquareText,
  Settings2,
  Code2,
  MessagesSquare,
  PhoneCall,
  CircleUserRound,
  MessageSquarePlus,
} from 'lucide-react';
import { NavItem } from '@/app/klantendashboard/components/nav-item';
import { V1SearchTrigger } from './search-trigger';

// V1 sidebar — EXACT V0 chrome (brand + SearchTrigger + nav) zonder OrgSwitcher
// (V1 heeft één org per sessie). Props komen uit de layout die getShellCounts
// aanroept; component zelf is puur presentationeel (geen data-fetch).
export function V1Sidebar({
  unansweredCount = 0,
  showContactRequests = false,
  contactRequestsCount = 0,
}: {
  /** Onbeantwoorde vragen → badge op Gesprekken. */
  unansweredCount?: number;
  /** Toggle aan → de Contactverzoeken-NavItem tonen (default uit, opt-in). */
  showContactRequests?: boolean;
  /** Aantal "Nieuw" → badge op Contactverzoeken. */
  contactRequestsCount?: number;
}) {
  return (
    <aside className="klant-sidebar" aria-label="Hoofdnavigatie">
      {/* Brand */}
      <Link
        href="/v1/app"
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

      <V1SearchTrigger />

      {/* Nav — flex:1 zodat de inhoud de sidebar vult (V0-patroon). */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, marginTop: 6 }}>
        <NavItem href="/v1/app" label="Overzicht" exact>
          <LayoutDashboard size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/app/kennisbank" label="Kennisbank">
          <Library size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/app/preview" label="Preview Chatbot">
          <MessageSquareText size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/app/instellingen" label="Instellingen">
          <Settings2 size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/app/widget" label="Widget">
          <Code2 size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/app/gesprekken" label="Gesprekken" badge={unansweredCount}>
          <MessagesSquare size={17} strokeWidth={1.7} />
        </NavItem>
        {showContactRequests && (
          <NavItem
            href="/v1/app/contactverzoeken"
            label="Contactverzoeken"
            badge={contactRequestsCount}
          >
            <PhoneCall size={17} strokeWidth={1.7} />
          </NavItem>
        )}
        <NavItem href="/v1/app/account" label="Account">
          <CircleUserRound size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/app/feedback" label="Feedback">
          <MessageSquarePlus size={17} strokeWidth={1.7} />
        </NavItem>
      </nav>
    </aside>
  );
}
