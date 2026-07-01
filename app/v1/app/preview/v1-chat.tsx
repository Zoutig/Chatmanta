'use client';

// V1 Preview — contained widget-FAB + chat-paneel (gespiegeld op V0 preview-widget).
//
// Recreëert de LOOK van de embed-widget: FAB met pulse, header met titel+subtitel,
// suggestie-chips, bericht-bubbels in widget-kleuren. Draait op `askV1` (server-
// action, multi-turn via optionele history). Multi-turn gesprek persisteert in
// localStorage per org+chatbot; een org/chatbot-switch levert een verse state.
//
// CONTAINMENT (hard requirement): FAB én paneel staan `position: absolute`
// BINNEN de relatief-gepositioneerde preview-container (PreviewFrame) — nooit
// `position: fixed`. Zo blijven ze altijd in het "browser-venster".
//
// Props komen uit V1ChatbotSettings (app/v1/app/instellingen/settings-config.ts):
//   accentColor  → FAB/header/verstuurknop-kleur (#rrggbb, gevalideerd)
//   position     → 'bottom-right' | 'bottom-left'
//   headerTitle  → leeg = valt terug op chatbotName
//   launcherText → tooltip naast FAB (optioneel)

import { useState, useTransition, useRef, useEffect } from 'react';
import { bestForegroundOn } from '@/lib/widget/contrast';
import { askV1, type AskV1Result } from '../actions';

// ponytail: inlined i.p.v. import uit lib/rag/run-rag-query (die draagt server-only).
type HistoryTurn = { role: 'user' | 'assistant'; content: string };

type Message = { id: string; role: 'user' | 'assistant'; content: string };

// LocalStorage-key per org+chatbot zodat een switch een vers gesprek oplevert.
const STORAGE_VERSION = 1;
const storageKey = (orgId: string, chatbotId: string) =>
  `v1-preview-chat:v${STORAGE_VERSION}:${orgId}:${chatbotId}`;

// Aantal turns dat als history naar askV1 gaat — spiegelt de server-side cap.
const HISTORY_TURNS_FOR_RAG = 10;

function loadStored(orgId: string, chatbotId: string): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(orgId, chatbotId));
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

function saveStored(orgId: string, chatbotId: string, messages: Message[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(orgId, chatbotId), JSON.stringify(messages));
  } catch {
    // Quota/serialize errors: stilzwijgend doorgaan.
  }
}

function clearStored(orgId: string, chatbotId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(orgId, chatbotId));
  } catch {
    // ignore
  }
}

/** Klant-vriendelijke NL-melding per fout-code van askV1. */
function errorLabel(res: Extract<AskV1Result, { ok: false }>): string {
  switch (res.error) {
    case 'NO_CHATBOT':      return 'Er is nog geen chatbot ingesteld voor deze organisatie.';
    case 'FORBIDDEN':       return 'Je hebt geen toegang tot deze chatbot.';
    case 'RATE_LIMITED':    return 'Het is nu erg druk. Probeer het zo dadelijk opnieuw.';
    case 'MONTHLY_LIMIT':   return 'De maandelijkse gesprekslimiet is bereikt.';
    case 'BUDGET_EXHAUSTED':return 'Het daglimiet van deze chatbot is bereikt.';
    case 'FAILED':
    default:                return 'Er ging iets mis. Probeer het opnieuw.';
  }
}

export function V1PreviewWidget({
  orgId,
  chatbotId,
  chatbotName,
  welcomeMessage,
  starterQuestions,
  accentColor,
  position,
  headerTitle,
  launcherText,
}: {
  orgId: string;
  chatbotId: string;
  chatbotName: string;
  welcomeMessage: string;
  starterQuestions: string[];
  accentColor: string;
  position: 'bottom-right' | 'bottom-left';
  headerTitle: string;
  launcherText: string;
}) {
  const headerFg = bestForegroundOn(accentColor);
  const isLeft = position === 'bottom-left';
  const displayTitle = headerTitle.trim() || chatbotName;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const nextId = (prefix: string) => `${prefix}-${++idRef.current}`;

  // Hydreer uit localStorage post-mount — voorkomt SSR/CSR mismatch.
  useEffect(() => {
    const stored = loadStored(orgId, chatbotId);
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
  }, [orgId, chatbotId]);

  // Persist na hydratatie — eerste render (lege array) slaat de stored history niet over.
  useEffect(() => {
    if (!hydrated) return;
    if (messages.length === 0) clearStored(orgId, chatbotId);
    else saveStored(orgId, chatbotId, messages);
  }, [messages, hydrated, orgId, chatbotId]);

  // Scroll naar de onderkant bij nieuwe berichten of paneel-open.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending, open]);

  function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    const userMsg: Message = { id: nextId('u'), role: 'user', content: q };
    const historyForRag: HistoryTurn[] = messages
      .slice(-HISTORY_TURNS_FOR_RAG * 2)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, userMsg]);
    setInput('');
    startTransition(async () => {
      try {
        const res = await askV1(q, historyForRag);
        setMessages((m) => [
          ...m,
          {
            id: nextId('a'),
            role: 'assistant',
            content: res.ok ? res.answer : `Er ging iets mis: ${errorLabel(res)}`,
          },
        ]);
      } catch {
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
  const sideOffset = 20;
  const fabSide = isLeft ? { left: sideOffset } : { right: sideOffset };
  const panelSide = isLeft ? { left: sideOffset } : { right: sideOffset };

  return (
    <>
      {/* Keyframes — inline om de Tailwind v4 PostCSS-drop-quirk te omzeilen */}
      <style>{`
        @keyframes v1-preview-pulse {
          0% { transform: scale(1); opacity: 0.45; }
          80% { transform: scale(1.55); opacity: 0; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        @keyframes v1-preview-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      {/* Chat-paneel — absolute binnen de preview-container */}
      {open && (
        <div
          role="dialog"
          aria-label={`${displayTitle} chat-preview`}
          style={{
            position: 'absolute',
            ...panelSide,
            bottom: 88,
            width: 'min(380px, calc(100% - 32px))',
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
          {/* Header */}
          <div
            style={{
              background: accentColor,
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
              <BubbleIcon color={headerFg} size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{displayTitle}</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>
                {launcherText.trim() || 'Online · meestal binnen seconden antwoord'}
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
            {/* Welkomstbericht */}
            <BotBubble color={accentColor} authorName={chatbotName}>
              {welcomeMessage}
            </BotBubble>

            {messages.map((m) =>
              m.role === 'user' ? (
                <UserBubble key={m.id} color={accentColor}>
                  {m.content}
                </UserBubble>
              ) : (
                <BotBubble key={m.id} color={accentColor}>
                  {m.content}
                </BotBubble>
              ),
            )}

            {pending && (
              <BotBubble color={accentColor}>
                <TypingDots />
              </BotBubble>
            )}

            {/* Suggestie-chips bij een leeg gesprek */}
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
                      border: `1px solid ${withAlpha(accentColor, 0.32)}`,
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
                background: pending || !input.trim() ? '#d1d5db' : accentColor,
                color: pending || !input.trim() ? '#6b7280' : headerFg,
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

          {/* Footer */}
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

      {/* FAB-container — absolute binnen de preview-container */}
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
        {/* Pulse-ring — alleen als gesloten */}
        {!open && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: accentColor,
              opacity: 0.45,
              animation: 'v1-preview-pulse 2.4s ease-out infinite',
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
            background: accentColor,
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
          {open ? (
            <CloseIcon size={22} color={headerFg} />
          ) : (
            <BubbleIcon color={headerFg} size={26} />
          )}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Bubble-presentatie-componenten (gespiegeld op V0 preview-widget)
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
        animation: 'v1-preview-bounce 1.1s infinite ease-in-out',
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — geen extra dep, zelfde aanpak als V0 preview-widget)
// ---------------------------------------------------------------------------

function BubbleIcon({ size = 26, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H9.5l-4 4v-4H5.5c-.83 0-1.5-.67-1.5-1.5v-9z"
        fill={color}
      />
    </svg>
  );
}

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
// Color util (zelfde als V0 preview-widget)
// ---------------------------------------------------------------------------
function withAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}
