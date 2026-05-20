'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  BookOpen,
  ShieldCheck,
  AlertTriangle,
  Sparkle,
  RotateCcw,
} from 'lucide-react';
import { askTestQuestion } from '../actions';

type SourceLite = { filename: string | null; excerpt: string };

type Message =
  | { id: string; role: 'user'; content: string }
  | {
      id: string;
      role: 'assistant';
      content: string;
      sources: SourceLite[];
      confidence: 'high' | 'medium' | 'low';
      kind: 'answer' | 'fallback' | 'smalltalk';
    };

function deriveConfidence(topSim?: number | null): 'high' | 'medium' | 'low' {
  if (topSim == null) return 'medium';
  if (topSim >= 0.7) return 'high';
  if (topSim >= 0.5) return 'medium';
  return 'low';
}

// localStorage key per org+bot zodat een org-switch of bot-versie-bump geen
// stale gesprek toont. Versie-prefix zodat we makkelijk kunnen invalideren als
// het Message-schema verandert.
const STORAGE_VERSION = 1;
const storageKey = (orgSlug: string, botVersion: string) =>
  `klant-test-chat:v${STORAGE_VERSION}:${orgSlug}:${botVersion}`;

// Aantal turns dat naar de RAG-pipeline gestuurd wordt als history. Sluit aan
// op de MAX_HISTORY_TURNS-cap in rag.ts — meer doorgeven wordt server-side
// alsnog afgekapt.
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

export function ChatPreview({
  orgSlug,
  botVersion,
  welcomeMessage,
  starterQuestions,
  chatbotName,
  primaryColor,
}: {
  orgSlug: string;
  botVersion: string;
  welcomeMessage: string;
  starterQuestions: string[];
  chatbotName: string;
  primaryColor: string;
}) {
  // Server-render = lege array (geen window). Client-mount hydrateert uit
  // localStorage in een useEffect — voorkomt SSR/CSR mismatch warnings.
  const [messages, setMessages] = useState<Message[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const nextId = (prefix: string) => `${prefix}-${++idRef.current}`;

  // Hydrate from localStorage post-mount. Bij org/bot-switch herhydreren we
  // — andere context = ander gesprek. Bewust setState binnen useEffect: dit
  // is de canonical SSR-safe hydratie-pattern (server rendert leeg, client
  // hydrateert na mount) — useState-initializer kan dit niet zonder
  // hydration-mismatch warnings. De react-hooks/set-state-in-effect lint
  // raadt useSyncExternalStore aan, maar dat is overkill voor één-richting
  // mount-hydratie.
  useEffect(() => {
    const stored = loadStored(orgSlug, botVersion);
    // Bump idRef boven de hoogste gevonden id-suffix zodat nieuwe berichten
    // geen collision krijgen met gerestoreerde berichten.
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
    if (messages.length === 0) {
      clearStored(orgSlug, botVersion);
    } else {
      saveStored(orgSlug, botVersion, messages);
    }
  }, [messages, hydrated, orgSlug, botVersion]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  function resetConversation() {
    if (pending) return;
    setMessages([]);
    setInput('');
    idRef.current = 0;
    clearStored(orgSlug, botVersion);
  }

  function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    const userMsg: Message = {
      id: nextId('u'),
      role: 'user',
      content: q,
    };
    // History = laatste N turns vóór deze nieuwe vraag, gemapt naar {role,content}.
    // Geen streaming-states te filteren — askTestQuestion is synchroon.
    const historyForRag = messages
      .slice(-HISTORY_TURNS_FOR_RAG * 2)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, userMsg]);
    setInput('');
    startTransition(async () => {
      const res = await askTestQuestion(q, historyForRag);
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          {
            id: nextId('a'),
            role: 'assistant',
            content: `Er ging iets mis: ${res.error}`,
            sources: [],
            confidence: 'low',
            kind: 'fallback',
          },
        ]);
        return;
      }
      const resp = res.response;
      const sources: SourceLite[] =
        resp.kind === 'answer' && Array.isArray(resp.sources)
          ? resp.sources.map((s) => ({
              filename: s.filename,
              excerpt: s.parentExcerpt ?? s.contentExcerpt ?? '',
            }))
          : [];
      const topSim =
        resp.kind === 'answer' && Array.isArray(resp.sources) && resp.sources.length > 0
          ? Math.max(...resp.sources.map((s) => s.similarity ?? 0))
          : null;
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: resp.answer,
          sources,
          confidence: deriveConfidence(topSim),
          kind: resp.kind,
        },
      ]);
    });
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant') as
    | Extract<Message, { role: 'assistant' }>
    | undefined;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
        gap: 20,
        minHeight: 540,
      }}
    >
      {/* Links: chat-preview */}
      <div
        className="klant-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          maxHeight: 'min(72vh, 720px)',
        }}
      >
        {/* Mock widget-header */}
        <div
          style={{
            padding: '14px 18px',
            background: primaryColor,
            color: '#fff',
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
            }}
          >
            <Bot size={16} strokeWidth={1.8} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{chatbotName}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              {messages.length > 0
                ? `${messages.filter((m) => m.role === 'user').length} testvragen · gesprek loopt door`
                : 'Reageert meestal binnen een paar seconden'}
            </div>
          </div>
          <button
            type="button"
            onClick={resetConversation}
            disabled={pending || messages.length === 0}
            title="Start een nieuw gesprek — de geschiedenis wordt gewist"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.16)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.24)',
              fontSize: 11,
              fontWeight: 500,
              cursor: pending || messages.length === 0 ? 'not-allowed' : 'pointer',
              opacity: pending || messages.length === 0 ? 0.45 : 1,
              fontFamily: 'inherit',
              transition: 'background 120ms ease, opacity 120ms ease',
            }}
          >
            <RotateCcw size={11} strokeWidth={2} />
            Reset
          </button>
        </div>

        {/* Berichten */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'var(--klant-bg)',
          }}
        >
          {/* Welkomstbericht (mock — niet in messages-state) */}
          <Bubble role="assistant" text={welcomeMessage} />

          {messages.length === 0 && starterQuestions.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 4,
                marginBottom: 4,
              }}
            >
              {starterQuestions.slice(0, 4).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={pending}
                  className="klant-btn"
                  data-variant="ghost"
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    background: 'var(--klant-surface)',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) => (
            <Bubble key={m.id} role={m.role} text={m.content} />
          ))}

          {pending && (
            <Bubble
              role="assistant"
              text={
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: 'var(--klant-fg-muted)',
                  }}
                >
                  <Sparkle size={12} /> Aan het denken…
                </span>
              }
            />
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          style={{
            display: 'flex',
            gap: 8,
            padding: 12,
            background: 'var(--klant-bg-elev)',
            borderTop: '1px solid var(--klant-border)',
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Stel een testvraag aan je chatbot"
            className="klant-input"
            disabled={pending}
          />
          <button
            type="submit"
            className="klant-btn"
            data-variant="primary"
            disabled={pending || !input.trim()}
          >
            <Send size={14} strokeWidth={1.8} />
            <span style={{ marginLeft: 4 }}>Verstuur</span>
          </button>
        </form>
      </div>

      {/* Rechts: antwoorddetails */}
      <aside>
        {lastAssistant ? (
          <AnswerDetails msg={lastAssistant} />
        ) : (
          <div className="klant-card">
            <h3 className="klant-section-title">Antwoorddetails</h3>
            <p className="klant-section-help">
              Stel een vraag links — hier verschijnen de bronnen die je chatbot heeft gebruikt
              en hoe zeker hij van zijn antwoord was.
            </p>
            <div
              style={{
                marginTop: 12,
                padding: 16,
                background: 'var(--klant-surface)',
                borderRadius: 'var(--klant-r-md)',
                fontSize: 13,
                color: 'var(--klant-fg-dim)',
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: 'var(--klant-fg-muted)', display: 'block', marginBottom: 4 }}>
                Tip
              </strong>
              Klik op een suggestie of typ een eigen vraag. Probeer ook bewust een vraag waar je
              chatbot het antwoord niet op weet — zo zie je hoe hij met onbekende vragen omgaat.
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            background: 'var(--klant-accent-soft)',
            color: 'var(--klant-accent)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Bot size={13} strokeWidth={1.8} />
        </div>
      )}
      <div
        style={{
          maxWidth: '78%',
          padding: '10px 13px',
          borderRadius: 'var(--klant-r-md)',
          background: isUser ? 'var(--klant-accent)' : 'var(--klant-bg-elev)',
          color: isUser ? '#03171a' : 'var(--klant-fg)',
          fontSize: 14,
          lineHeight: 1.55,
          border: isUser ? 'none' : '1px solid var(--klant-border)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
      {isUser && (
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            background: 'var(--klant-surface)',
            color: 'var(--klant-fg-muted)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <User size={13} strokeWidth={1.8} />
        </div>
      )}
    </div>
  );
}

function AnswerDetails({ msg }: { msg: Extract<Message, { role: 'assistant' }> }) {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [showImprove, setShowImprove] = useState(false);
  const [improvedAnswer, setImprovedAnswer] = useState('');
  const [improveStatus, setImproveStatus] = useState<'idle' | 'saved'>('idle');

  const confidenceCfg = {
    high: { label: 'Hoog', tone: 'success' as const, Icon: ShieldCheck },
    medium: { label: 'Gemiddeld', tone: 'info' as const, Icon: ShieldCheck },
    low: { label: 'Laag', tone: 'warning' as const, Icon: AlertTriangle },
  }[msg.confidence];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h3 className="klant-section-title">Antwoorddetails</h3>
          <span className="klant-status" data-tone={confidenceCfg.tone}>
            {confidenceCfg.label} vertrouwen
          </span>
        </div>

        {/* Bronnen */}
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--klant-fg-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              marginBottom: 6,
            }}
          >
            <BookOpen size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
            Gebruikte bronnen
          </div>
          {msg.sources.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: 'var(--klant-fg-muted)',
                margin: 0,
                padding: '10px 12px',
                background: 'var(--klant-surface)',
                borderRadius: 'var(--klant-r-sm)',
              }}
            >
              {msg.kind === 'fallback'
                ? 'Geen relevante bronnen gevonden — je chatbot gaf het eerlijke "weet niet"-antwoord.'
                : 'Geen bronnen — dit was een algemeen antwoord.'}
            </p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {msg.sources.slice(0, 5).map((s, i) => (
                <li
                  key={i}
                  style={{
                    padding: '8px 10px',
                    background: 'var(--klant-surface)',
                    borderRadius: 'var(--klant-r-sm)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ color: 'var(--klant-fg)', fontWeight: 500 }}>
                    {s.filename || 'Onbekend'}
                  </div>
                  {s.excerpt && (
                    <div
                      style={{
                        color: 'var(--klant-fg-muted)',
                        marginTop: 2,
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {s.excerpt}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Feedback */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--klant-border)',
          }}
        >
          <button
            type="button"
            onClick={() => setFeedback('up')}
            className="klant-btn"
            data-variant={feedback === 'up' ? 'primary' : 'ghost'}
            style={{ fontSize: 12, padding: '6px 10px' }}
          >
            👍 Goed antwoord
          </button>
          <button
            type="button"
            onClick={() => {
              setFeedback('down');
              setShowImprove(true);
            }}
            className="klant-btn"
            data-variant={feedback === 'down' ? 'primary' : 'ghost'}
            style={{ fontSize: 12, padding: '6px 10px' }}
          >
            👎 Niet goed
          </button>
          <button
            type="button"
            onClick={() => setShowImprove(true)}
            className="klant-btn"
            data-variant="ghost"
            style={{ fontSize: 12, padding: '6px 10px', marginLeft: 'auto' }}
          >
            Verbeter dit antwoord
          </button>
        </div>
      </div>

      {showImprove && (
        <div
          className="klant-card"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <h3 className="klant-section-title">Verbeter dit antwoord</h3>
          <p className="klant-section-help" style={{ margin: 0 }}>
            Schrijf hieronder wat je chatbot had moeten antwoorden. Dit wordt opgeslagen als
            handmatige Q&amp;A in je kennisbank.
          </p>
          <div
            style={{
              padding: '8px 10px',
              background: 'var(--klant-surface)',
              borderRadius: 'var(--klant-r-sm)',
              fontSize: 12,
            }}
          >
            <div style={{ color: 'var(--klant-fg-muted)', marginBottom: 4 }}>Origineel antwoord</div>
            <div style={{ color: 'var(--klant-fg)' }}>{msg.content}</div>
          </div>
          <textarea
            value={improvedAnswer}
            onChange={(e) => setImprovedAnswer(e.target.value)}
            placeholder="Het juiste antwoord is…"
            className="klant-textarea"
            rows={4}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                setShowImprove(false);
                setImprovedAnswer('');
                setImproveStatus('idle');
              }}
              className="klant-btn"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => {
                if (improvedAnswer.trim()) {
                  // Mock — in V1 wordt dit een server action.
                  setImproveStatus('saved');
                  setTimeout(() => {
                    setShowImprove(false);
                    setImprovedAnswer('');
                    setImproveStatus('idle');
                  }, 1400);
                }
              }}
              className="klant-btn"
              data-variant="primary"
              disabled={!improvedAnswer.trim() || improveStatus === 'saved'}
            >
              {improveStatus === 'saved' ? 'Opgeslagen!' : 'Opslaan als Q&A'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
