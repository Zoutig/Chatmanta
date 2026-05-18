'use client';

// ChatManta-widget voor de /widget demo-pagina.
//
// FAB linksonder → open/dicht-paneel met streaming-chat tegen /api/v0/chat.
// Suggested-questions chips bij eerste opening. "Powered by ChatManta"-footer.
//
// MVP-scope: alleen het kale chat-pad. Geen bronnen-view, geen claim-tabs,
// geen latency-snapshot — die zijn admintool-features. Sources/claims/etc.
// in StreamEvents worden bewust genegeerd.
//
// Streaming-pattern is overgenomen uit app/components/chat-shell.tsx:230-360.
// React 19 batched updates → flushSync per delta voor zichtbare streaming.

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ChatResponse } from '@/lib/v0/server/rag';

type Message =
  | { role: 'user'; content: string; id: string }
  | { role: 'assistant'; content: string; id: string; streaming?: boolean; error?: string };

export type ChatMantaWidgetProps = {
  orgSlug: string;
  botVersion: string;
  companyName: string;
  primaryColor: string;
  suggested: string[];
};

export function ChatMantaWidget({
  orgSlug,
  botVersion,
  companyName,
  primaryColor,
  suggested,
}: ChatMantaWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll naar onderkant bij nieuwe content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Focus input bij openen.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Cleanup pending request bij unmount of org/bot-switch (key-prop reset).
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || pending) return;

      const userMsg: Message = { role: 'user', content: trimmed, id: makeId() };
      const assistantId = makeId();

      // History = alles wat we al hadden, gemapt naar {role, content}.
      // User-msgs gaan altijd mee; assistant-msgs alleen als ze afgerond zijn.
      const history = messages
        .filter((m) => m.role === 'user' || (!m.streaming && !m.error))
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      flushSync(() => {
        setMessages((prev) => [
          ...prev,
          userMsg,
          { role: 'assistant', content: '', id: assistantId, streaming: true },
        ]);
        setPending(true);
        setInput('');
      });

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch(`/api/v0/chat?org=${encodeURIComponent(orgSlug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: trimmed,
            version: botVersion,
            history,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const status = res.status;
          updateAssistant(setMessages, assistantId, {
            content: status === 401 || status === 403
              ? 'Even inloggen op de demo-omgeving om verder te chatten.'
              : 'Er ging iets mis met dit antwoord. Probeer het zo nog eens.',
            error: `HTTP ${status}`,
            streaming: false,
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;

            let event: unknown;
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            handleEvent(event, setMessages, assistantId);
          }
        }

        // Markeer als niet meer streamend (voor het geval answer-done ontbrak).
        updateAssistant(setMessages, assistantId, { streaming: false });
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        updateAssistant(setMessages, assistantId, {
          content: 'Verbinding viel weg — probeer het zo nog eens.',
          error: String(err),
          streaming: false,
        });
      } finally {
        setPending(false);
        abortRef.current = null;
      }
    },
    [messages, orgSlug, botVersion, pending],
  );

  const showSuggested = !open ? false : messages.length === 0 && !pending;

  return (
    <>
      {/* FAB linksonder */}
      <button
        type="button"
        aria-label={open ? 'Sluit chat' : 'Open chat'}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed',
          left: 24,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: primaryColor,
          color: bestForegroundOn(primaryColor),
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 12px 32px -8px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: 'transform 180ms ease, box-shadow 180ms ease',
          transform: open ? 'scale(0.9)' : 'scale(1)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = open
            ? 'scale(0.94)'
            : 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = open
            ? 'scale(0.9)'
            : 'scale(1)';
        }}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>

      {/* Keyframes — inline om de Tailwind v4 PostCSS-drop-quirk te omzeilen. */}
      <style>{`
        @keyframes chatmanta-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes chatmanta-blink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
      `}</style>

      {/* Paneel */}
      {open && (
        <div
          role="dialog"
          aria-label={`${companyName} chat`}
          style={{
            position: 'fixed',
            left: 24,
            bottom: 96,
            width: 380,
            height: 560,
            maxHeight: 'calc(100vh - 120px)',
            background: '#ffffff',
            color: '#0e1014',
            borderRadius: 16,
            boxShadow:
              '0 28px 72px -16px rgba(0,0,0,0.28), 0 10px 24px -8px rgba(0,0,0,0.16)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9998,
            fontFamily: 'var(--font-inter), system-ui, sans-serif',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: primaryColor,
              color: bestForegroundOn(primaryColor),
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{companyName}</span>
              <span style={{ fontSize: 11, opacity: 0.85 }}>
                Online · meestal binnen seconden antwoord
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Sluit"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 4,
                opacity: 0.85,
              }}
            >
              <CloseIcon size={16} />
            </button>
          </div>

          {/* Berichten-area */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 18px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: '#f7f8fa',
            }}
          >
            {/* Welkomstbericht */}
            {messages.length === 0 && (
              <BotBubble color={primaryColor}>
                Hoi! Ik ben de digitale assistent van <strong>{companyName}</strong>.
                Stel je vraag — ik zoek het op in onze content.
              </BotBubble>
            )}

            {messages.map((m) =>
              m.role === 'user' ? (
                <UserBubble key={m.id} color={primaryColor}>
                  {m.content}
                </UserBubble>
              ) : (
                <BotBubble key={m.id} color={primaryColor}>
                  {m.streaming && !m.content ? <TypingDots /> : renderMarkdownLite(m.content)}
                  {m.streaming && m.content ? <Caret /> : null}
                </BotBubble>
              ),
            )}

            {/* Suggested questions */}
            {showSuggested && suggested.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                  Veelgestelde vragen
                </span>
                {suggested.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    style={{
                      textAlign: 'left',
                      background: '#ffffff',
                      color: '#0e1014',
                      border: `1px solid ${withAlpha(primaryColor, 0.32)}`,
                      borderRadius: 10,
                      padding: '8px 12px',
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = withAlpha(primaryColor, 0.08);
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = '#ffffff';
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input-bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
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
              ref={inputRef}
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
                background: pending || !input.trim() ? '#d1d5db' : primaryColor,
                color: bestForegroundOn(primaryColor),
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

          {/* Footer: Powered by ChatManta */}
          <div
            style={{
              padding: '8px 14px 10px',
              borderTop: '1px solid #f0f1f3',
              background: '#ffffff',
              fontSize: 11,
              color: '#9ca3af',
              textAlign: 'center',
            }}
          >
            Powered by{' '}
            <a
              href="/home"
              style={{ color: '#6b7280', textDecoration: 'none', fontWeight: 600 }}
              target="_blank"
              rel="noopener noreferrer"
            >
              ChatManta
            </a>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Stream-event handler — knip out van handle-loop voor leesbaarheid.
// ---------------------------------------------------------------------------
function handleEvent(
  event: unknown,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  assistantId: string,
) {
  if (!event || typeof event !== 'object') return;
  const e = event as { kind?: string };

  if (e.kind === 'smalltalk' || e.kind === 'fallback') {
    const resp = (e as { response?: ChatResponse }).response;
    if (resp && (resp.kind === 'smalltalk' || resp.kind === 'fallback' || resp.kind === 'answer')) {
      updateAssistant(setMessages, assistantId, {
        content: resp.answer,
        streaming: false,
      });
    }
    return;
  }

  if (e.kind === 'answer-start') {
    updateAssistant(setMessages, assistantId, { content: '', streaming: true });
    return;
  }

  if (e.kind === 'answer-delta') {
    const text = (e as { text?: string }).text ?? '';
    if (!text) return;
    // flushSync per delta zodat React 19 niet meerdere tokens in één commit batcht.
    flushSync(() => {
      setMessages((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((m) => m.id === assistantId);
        if (idx < 0) return prev;
        const cur = next[idx];
        if (cur.role !== 'assistant') return prev;
        next[idx] = { ...cur, content: cur.content + text, streaming: true };
        return next;
      });
    });
    return;
  }

  if (e.kind === 'answer-done') {
    const resp = (e as { response?: ChatResponse }).response;
    if (resp && resp.kind === 'answer') {
      updateAssistant(setMessages, assistantId, {
        content: resp.answer,
        streaming: false,
      });
    } else {
      updateAssistant(setMessages, assistantId, { streaming: false });
    }
    return;
  }

  if (e.kind === 'replacement') {
    const resp = (e as { response?: ChatResponse }).response;
    if (resp && resp.kind === 'answer') {
      updateAssistant(setMessages, assistantId, {
        content: resp.answer,
        streaming: false,
      });
    }
    return;
  }

  if (e.kind === 'error') {
    const code = (e as { code?: string }).code ?? 'UNKNOWN';
    updateAssistant(setMessages, assistantId, {
      content: code === 'RATE_LIMITED'
        ? 'Even rustig aan — te veel berichten op rij. Probeer over een momentje opnieuw.'
        : 'Er ging iets mis aan onze kant. Probeer het zo nog eens.',
      error: code,
      streaming: false,
    });
  }
}

function updateAssistant(
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  id: string,
  patch: Partial<Extract<Message, { role: 'assistant' }>>,
) {
  setMessages((prev) => {
    const next = prev.slice();
    const idx = next.findIndex((m) => m.id === id);
    if (idx < 0) return prev;
    const cur = next[idx];
    if (cur.role !== 'assistant') return prev;
    next[idx] = { ...cur, ...patch };
    return next;
  });
}

// ---------------------------------------------------------------------------
// Mini-presentation components
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

function BotBubble({ children, color }: { children: React.ReactNode; color: string }) {
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
        animation: 'chatmanta-bounce 1.1s infinite ease-in-out',
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

function Caret() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 6,
        height: 14,
        marginLeft: 2,
        background: '#9ca3af',
        verticalAlign: 'text-bottom',
        animation: 'chatmanta-blink 1s infinite step-end',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Markdown-lite: alleen **bold** segmenten — past bij de v0.5+ system-prompt
// die de bot instrueert om kernwoorden vet te zetten. Geen volledige md-parser.
// ---------------------------------------------------------------------------
function renderMarkdownLite(text: string): React.ReactNode {
  // Verwijder eventueel weggelekte <thinking>/<answer>-tags (v0.3+ output-format).
  let clean = text;
  clean = clean.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
  clean = clean.replace(/<\/?answer>/g, '');
  clean = clean.replace(/<confidence>[\s\S]*?<\/confidence>/g, '');
  // Verwijder [n]-citaties — de widget heeft geen sources-view.
  clean = clean.replace(/\s*\[\d+\](\[\d+\])*/g, '');
  clean = clean.trim();

  const parts = clean.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — geen extra dep)
// ---------------------------------------------------------------------------
function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CloseIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Color utilities — gedupliceerd uit fake-site.tsx voor zelfstandigheid.
// ---------------------------------------------------------------------------
function isHexDark(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
}

function bestForegroundOn(hex: string): string {
  return isHexDark(hex) ? '#ffffff' : '#0a0a0a';
}

function withAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
