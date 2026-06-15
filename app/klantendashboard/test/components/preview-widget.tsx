'use client';

// V0 Klantendashboard — Preview Chatbot: contained widget-FAB + chat-paneel.
//
// Dit component recreëert de LOOK van de echte ChatManta-widget
// (app/widget/components/chatmanta-widget.tsx) — brand-mark FAB met pulse,
// header met logo+titel+subtitel, suggestie-chips, bericht-bubbels — maar
// draait NIET op de token-gated /api/v0/chat. In plaats daarvan gebruikt het
// de dashboard-veilige server-action `askTestQuestion` (synchroon, geen
// streaming), exact zoals de oude chat-preview.tsx. Org komt server-side uit
// de cookie binnen die action; hier geven we alleen orgSlug/botVersion door
// voor de localStorage-key.
//
// CONTAINMENT (hard requirement): de FAB én het paneel staan `position:
// absolute` BINNEN de relatief-gepositioneerde preview-container (zie
// preview-frame.tsx) — nooit `position: fixed`. Zo blijven ze altijd binnen
// het "browser-venster" en ontsnappen ze nooit naar de echte viewport.

import { useState, useTransition, useRef, useEffect } from 'react';
import { askTestQuestion } from '../actions';
import { WidgetLogo } from '../../components/widget-logo';
import { bestForegroundOn } from '@/lib/widget/contrast';
import type { WidgetSettings } from '@/lib/v0/klantendashboard/types';

type Message = { id: string; role: 'user' | 'assistant'; content: string };

// localStorage-key per org+bot zodat een org-switch of bot-versie-bump geen
// stale gesprek toont. Versie-prefix zodat we makkelijk kunnen invalideren als
// het Message-schema verandert. (Spiegelt chat-preview.tsx — eigen key zodat
// de twee weergaven elkaars historie niet clobberen.)
const STORAGE_VERSION = 1;
const storageKey = (orgSlug: string, botVersion: string) =>
  `klant-preview-chat:v${STORAGE_VERSION}:${orgSlug}:${botVersion}`;

// Aantal turns dat als history naar de RAG-pipeline gaat — sluit aan op de
// MAX_HISTORY_TURNS-cap server-side (meer wordt alsnog afgekapt).
const HISTORY_TURNS_FOR_RAG = 10;

function loadStored(orgSlug: string, botVersion: string): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(orgSlug, botVersion));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m) => {
      if (!m || typeof m !== 'object') return false;
      const r = (m as { role?: unknown }).role;
      const c = (m as { content?: unknown }).content;
      return (r === 'user' || r === 'assistant') && typeof c === 'string';
    }) as Message[];
  } catch {
    return [];
  }
}

function saveStored(orgSlug: string, botVersion: string, messages: Message[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(orgSlug, botVersion), JSON.stringify(messages));
  } catch {
    // Quota / serialize errors: stilzwijgend doorgaan — verloren gesprek is geen ramp.
  }
}

function clearStored(orgSlug: string, botVersion: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(orgSlug, botVersion));
  } catch {
    // ignore
  }
}

export function PreviewWidget({
  orgSlug,
  botVersion,
  welcomeMessage,
  starterQuestions,
  widget,
  chatbotName,
}: {
  orgSlug: string;
  botVersion: string;
  welcomeMessage: string;
  starterQuestions: string[];
  widget: WidgetSettings;
  chatbotName: string;
}) {
  // Granulaire kleuren met fallback op primaryColor — zelfde resolutie als in
  // de echte widget zodat de preview 1:1 reflecteert wat de bezoeker ziet.
  const c = {
    logo: widget.logoColor || widget.primaryColor,
    widgetBg: widget.widgetBgColor || '#ffffff',
    pulse: widget.pulseColor || widget.primaryColor,
    header: widget.headerColor || widget.primaryColor,
  };
  const headerFg = bestForegroundOn(c.header);
  const isLeft = widget.position === 'bottom-left';
  const pulseEnabled = widget.pulseEnabled !== false;
  const displayTitle = widget.title?.trim() || chatbotName;

  const [open, setOpen] = useState(false);
  // Server-render = lege array (geen window). Client-mount hydrateert uit
  // localStorage in een useEffect — voorkomt SSR/CSR mismatch warnings.
  const [messages, setMessages] = useState<Message[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const nextId = (prefix: string) => `${prefix}-${++idRef.current}`;

  // Hydrate from localStorage post-mount. Bij org/bot-switch herhydreren we —
  // andere context = ander gesprek. (Zelfde SSR-safe patroon als chat-preview.)
  useEffect(() => {
    const stored = loadStored(orgSlug, botVersion);
    let maxN = 0;
    for (const m of stored) {
      const match = /-(\d+)$/.exec(m.id);
      if (match) maxN = Math.max(maxN, Number(match[1]));
    }
    idRef.current = maxN;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(stored);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [orgSlug, botVersion]);

  // Persist alle wijzigingen — pas nadat we gehydreerd zijn anders zou de
  // eerste render (lege array) de stored history overschrijven.
  useEffect(() => {
    if (!hydrated) return;
    if (messages.length === 0) clearStored(orgSlug, botVersion);
    else saveStored(orgSlug, botVersion, messages);
  }, [messages, hydrated, orgSlug, botVersion]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending, open]);

  function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    const userMsg: Message = { id: nextId('u'), role: 'user', content: q };
    // History = laatste N turns vóór deze nieuwe vraag, gemapt naar {role,content}.
    const historyForRag = messages
      .slice(-HISTORY_TURNS_FOR_RAG * 2)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, userMsg]);
    setInput('');
    startTransition(async () => {
      try {
        const res = await askTestQuestion(q, historyForRag);
        if (!res.ok) {
          setMessages((m) => [
            ...m,
            { id: nextId('a'), role: 'assistant', content: `Er ging iets mis: ${res.error}` },
          ]);
          return;
        }
        setMessages((m) => [
          ...m,
          { id: nextId('a'), role: 'assistant', content: res.response.answer },
        ]);
      } catch {
        // Transport-/netwerkfout: de server-action zelf rejectte (geen ActionResult).
        // Toon dezelfde nette foutbubble i.p.v. een unhandled rejection + een
        // onbeantwoorde vraag.
        setMessages((m) => [
          ...m,
          {
            id: nextId('a'),
            role: 'assistant',
            content: 'Er ging iets mis bij het versturen. Probeer het opnieuw.',
          },
        ]);
      }
    });
  }

  const showSuggested = open && messages.length === 0 && !pending;

  // Side-aware absolute-positie BINNEN de container. Bewust GEEN safe-area-inset
  // /fixed — de FAB hoort in de preview, niet in de echte viewport.
  const sideOffset = 20;
  const fabSide = isLeft ? { left: sideOffset } : { right: sideOffset };
  const panelSide = isLeft ? { left: sideOffset } : { right: sideOffset };

  return (
    <>
      {/* Keyframes — inline om de Tailwind v4 PostCSS-drop-quirk te omzeilen. */}
      <style>{`
        @keyframes klant-preview-pulse {
          0% { transform: scale(1); opacity: 0.45; }
          80% { transform: scale(1.55); opacity: 0; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        @keyframes klant-preview-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      {/* Chat-paneel — absolute binnen de preview-container. Open vanaf de FAB-hoek. */}
      {open && (
        <div
          role="dialog"
          aria-label={`${displayTitle} chat-preview`}
          style={{
            position: 'absolute',
            ...panelSide,
            bottom: 88,
            width: 'min(380px, calc(100% - 32px))',
            // Vul de container maar laat de FAB-hoek vrij; cap zodat het paneel
            // niet boven de container uitsteekt.
            height: 'min(460px, calc(100% - 110px))',
            background: '#ffffff',
            color: '#0e1014',
            borderRadius: 16,
            boxShadow:
              '0 28px 72px -16px rgba(0,0,0,0.28), 0 10px 24px -8px rgba(0,0,0,0.16)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 3,
            fontFamily: 'var(--klant-font-body)',
          }}
        >
          {/* Header — logo + titel + subtitel in de header-kleur. */}
          <div
            style={{
              background: c.header,
              color: headerFg,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.18)',
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <WidgetLogo widget={widget} size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{displayTitle}</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>
                {widget.subtitle?.trim() || 'Online · meestal binnen seconden antwoord'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Sluit chat"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 4,
                opacity: 0.85,
                display: 'inline-flex',
                fontFamily: 'inherit',
              }}
            >
              <CloseIcon size={18} />
            </button>
          </div>

          {/* Berichten-area */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 14px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: '#f7f8fa',
            }}
          >
            {/* Welkomstbericht — mock, niet in messages-state (zoals de echte widget). */}
            <BotBubble color={c.header} authorName={chatbotName}>
              {welcomeMessage}
            </BotBubble>

            {messages.map((m) =>
              m.role === 'user' ? (
                <UserBubble key={m.id} color={c.header}>
                  {m.content}
                </UserBubble>
              ) : (
                <BotBubble key={m.id} color={c.header}>
                  {m.content}
                </BotBubble>
              ),
            )}

            {pending && (
              <BotBubble color={c.header}>
                <TypingDots />
              </BotBubble>
            )}

            {/* Suggestie-chips bij een leeg gesprek. */}
            {showSuggested && starterQuestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: '#6b7280',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 2,
                  }}
                >
                  Veelgestelde vragen
                </span>
                {starterQuestions.slice(0, 4).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    disabled={pending}
                    style={{
                      textAlign: 'left',
                      background: '#ffffff',
                      color: '#0e1014',
                      border: `1px solid ${withAlpha(c.header, 0.32)}`,
                      borderRadius: 10,
                      padding: '8px 12px',
                      fontSize: 13,
                      cursor: pending ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            style={{
              padding: '10px 12px 12px',
              borderTop: '1px solid #eaecef',
              background: '#ffffff',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Stel je vraag…"
              disabled={pending}
              style={{
                flex: 1,
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
                color: '#0e1014',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Verstuur"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: pending || !input.trim() ? '#d1d5db' : c.header,
                color: headerFg,
                border: 'none',
                cursor: pending || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <SendIcon />
            </button>
          </form>

          {/* Footer — "Powered by ChatManta", zoals op de echte widget. */}
          <div
            style={{
              padding: '7px 14px 9px',
              borderTop: '1px solid #f0f1f3',
              background: '#ffffff',
              fontSize: 11,
              color: '#9ca3af',
              textAlign: 'center',
            }}
          >
            Powered by <strong style={{ color: '#6b7280', fontWeight: 600 }}>ChatManta</strong>
          </div>
        </div>
      )}

      {/* FAB-container (links of rechts onder) — absolute binnen de container. */}
      <div
        style={{
          position: 'absolute',
          ...fabSide,
          bottom: 20,
          width: 56,
          height: 56,
          zIndex: 4,
        }}
      >
        {/* Pulse-ring achter de FAB — alleen zichtbaar als de chat gesloten is
            en pulseEnabled aan staat. */}
        {!open && pulseEnabled && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: c.pulse,
              opacity: 0.45,
              animation: 'klant-preview-pulse 2.4s ease-out infinite',
              pointerEvents: 'none',
            }}
          />
        )}
        <button
          type="button"
          aria-label={open ? 'Sluit chat' : 'Open chat'}
          onClick={() => setOpen((v) => !v)}
          style={{
            position: 'relative',
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: c.widgetBg,
            border: '1px solid rgba(0,0,0,0.06)',
            cursor: 'pointer',
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 180ms ease',
            transform: open ? 'scale(0.9)' : 'scale(1)',
            padding: 0,
            overflow: 'hidden',
            fontFamily: 'inherit',
          }}
        >
          {open ? <CloseIcon size={22} color={c.logo} /> : <WidgetLogo widget={widget} size={26} />}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mini-presentation components — recreëren de bubble-look van de echte widget.
// ---------------------------------------------------------------------------
function UserBubble({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          background: color,
          color: bestForegroundOn(color),
          padding: '8px 12px',
          borderRadius: '14px 14px 4px 14px',
          maxWidth: '78%',
          fontSize: 14,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function BotBubble({
  children,
  color,
  authorName,
}: {
  children: React.ReactNode;
  color: string;
  authorName?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        style={{
          background: '#ffffff',
          color: '#0e1014',
          padding: '8px 12px',
          borderRadius: '14px 14px 14px 4px',
          maxWidth: '88%',
          fontSize: 14,
          lineHeight: 1.5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          border: `1px solid ${withAlpha(color, 0.14)}`,
          whiteSpace: 'pre-wrap',
        }}
      >
        {authorName && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#6b7280',
              marginBottom: 4,
              letterSpacing: '0.01em',
            }}
          >
            {authorName}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </span>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: '#9ca3af',
        animation: 'klant-preview-bounce 1.1s infinite ease-in-out',
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — geen extra dep).
// ---------------------------------------------------------------------------
function CloseIcon({ size = 22, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Color util — lokaal (zelfde als in de echte widget).
// ---------------------------------------------------------------------------
function withAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
