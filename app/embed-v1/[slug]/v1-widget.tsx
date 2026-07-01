'use client';

// Gefocuste V1-widget: FAB-launcher → chat-paneel → NDJSON-streaming chat, met
// token-refresh-op-401 en postMessage-resize naar de loader. Bewust GEEN V0-extra's
// (thread-drawer, feedback-duimen, contact-formulier, org-skins, fake-site) — die
// zijn V2 (zie M-B_SPEC §G). Hergebruikt de NEUTRALE lib/widget-helpers.

import { useCallback, useEffect, useRef, useState } from 'react';
import { renderMarkdownLite } from '@/lib/widget/render-markdown-lite';
import { getOrCreateVisitorId } from '@/lib/widget/visitor-id';
import { bestForegroundOn } from '@/lib/widget/contrast';
import type { WidgetPosition } from '@/lib/v0/klantendashboard/types';

export type V1WidgetProps = {
  slug: string;
  embedToken: string;
  botVersion: string;
  accentColor: string;
  position: WidgetPosition;
  headerTitle: string;
  welcomeMessage: string;
  launcherText: string;
  /**
   * Toont de "persoonlijk contact"-knop + -formulier in de widget. Komt uit de
   * embed-payload (load-embed → org-settings). Default false → fail-closed: zonder
   * expliciet aan-staan bieden we het formulier niet aan. De submit-route
   * (/api/v1/contact-request) is de autoritatieve gate; dit is enkel de UI-zichtbaarheid.
   */
  contactRequestsEnabled?: boolean;
};

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
  // Feedback-koppeling: queryLogId komt binnen via het 'meta'-event (eerste regel
  // van de stream) vóór de eerste delta; de duim-knoppen koppelen daarop.
  queryLogId?: string;
  feedbackRating?: 'up' | 'down';
  feedbackState?: 'sending' | 'sent' | 'error';
};

// We posten naar de loader met targetOrigin '*': de signalen (ready/resize) zijn
// niet-gevoelig, en de loader valideert zélf e.origin vóór hij iets doet.
const PARENT_TARGET = '*';

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export function V1Widget(props: V1WidgetProps) {
  const { slug, botVersion, accentColor, position, headerTitle, welcomeMessage, launcherText } = props;
  const contactEnabled = props.contactRequestsEnabled === true;
  const fg = bestForegroundOn(accentColor);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  // Contact-formulier: dicht/open/verzonden. Eén sessie = één verzending (daarna
  // tonen we de bedankt-staat i.p.v. het formulier opnieuw).
  const [contactOpen, setContactOpen] = useState(false);
  const [contactDone, setContactDone] = useState(false);

  const embedTokenRef = useRef(props.embedToken);
  const visitorIdRef = useRef<string | null>(null);
  // Stabiele sessie-thread-id (één per widget-mount). Gaat als threadId mee in elke
  // chat-POST zodat de turns server-side in één thread landen. Géén autorisatie-rol.
  const threadIdRef = useRef<string>(makeId());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Patch één message op id — gedeeld door de stream-handler en de feedback-flow.
  const patchMsg = useCallback((id: string, patch: Partial<Msg>) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx < 0) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  // Host-grootte: de iframe-viewport zegt niets over het échte scherm. De loader
  // (in de hostpagina) stuurt 'chatmanta:host'; init uit ?m=1 (anti-flits).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsMobile(new URLSearchParams(window.location.search).get('m') === '1');
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const d = e.data as { type?: string; mobile?: unknown } | null;
      if (!d || d.type !== 'chatmanta:host') return;
      setIsMobile(Boolean(d.mobile));
    };
    window.addEventListener('message', onMsg);
    try {
      window.parent.postMessage({ type: 'chatmanta:ready' }, PARENT_TARGET);
    } catch {
      /* parent niet bereikbaar — init uit ?m=1 blijft staan */
    }
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Vertel de loader collapsed/peek/open + de hoek, zodat hij de iframe resize't.
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    const peeking = !open && tooltipVisible && launcherText.trim().length > 0;
    const state = open ? 'open' : peeking ? 'peek' : 'collapsed';
    window.parent.postMessage({ type: 'chatmanta:resize', state, side: position }, PARENT_TARGET);
  }, [open, tooltipVisible, position, launcherText]);

  // Tooltip 1× tonen 4s na mount (alleen als er launcherText is), dan weg.
  useEffect(() => {
    if (open || !launcherText.trim()) return;
    const show = setTimeout(() => setTooltipVisible(true), 4000);
    const hide = setTimeout(() => setTooltipVisible(false), 10000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [open, launcherText]);

  // Auto-scroll bij nieuwe content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const refreshEmbedToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`/api/v1/widget/token?org=${encodeURIComponent(slug)}`, { method: 'GET' });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: unknown };
      const token = typeof data.token === 'string' ? data.token : null;
      if (token) embedTokenRef.current = token;
      return token;
    } catch {
      return null;
    }
  }, [slug]);

  // Feedback 👍/👎 → /api/v1/feedback. Zelfde token + 401→refresh→1×-retry als chat.
  // queryLogId komt uit de meta-event-koppeling op de message; rating in up/down.
  const submitFeedback = useCallback(
    async (messageId: string, queryLogId: string, rating: 'up' | 'down') => {
      patchMsg(messageId, { feedbackRating: rating, feedbackState: 'sending' });
      const post = (token: string) =>
        fetch(`/api/v1/feedback?org=${encodeURIComponent(slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-chatmanta-embed': token },
          body: JSON.stringify({ queryLogId, rating }),
        });
      try {
        let res = await post(embedTokenRef.current);
        if (res.status === 401 || res.status === 403) {
          const fresh = await refreshEmbedToken();
          if (fresh) res = await post(fresh);
        }
        patchMsg(messageId, { feedbackState: res.ok ? 'sent' : 'error', feedbackRating: rating });
      } catch {
        patchMsg(messageId, { feedbackState: 'error', feedbackRating: rating });
      }
    },
    [slug, refreshEmbedToken, patchMsg],
  );

  // Contactformulier → /api/v1/contact-request. Spiegelt de chat-fetch: zelfde org-slug,
  // x-chatmanta-embed-token, en 401→token-refresh→1×-retry zodat een traag ingevuld
  // formulier de lead niet kost op een verlopen 30-min-token. consentGiven hard true
  // (de route + DB-CHECK borgen het ook). Geeft true bij 200/201.
  const submitContact = useCallback(
    async (payload: {
      name: string;
      email: string | null;
      phone: string | null;
      preferredContact: 'call' | 'email';
      subject: string | null;
      message: string | null;
      company_url: string;
    }): Promise<boolean> => {
      const post = (token: string) =>
        fetch(`/api/v1/contact-request?org=${encodeURIComponent(slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-chatmanta-embed': token },
          body: JSON.stringify({ ...payload, consentGiven: true }),
        });
      try {
        let res = await post(embedTokenRef.current);
        if (res.status === 401 || res.status === 403) {
          const fresh = await refreshEmbedToken();
          if (fresh) res = await post(fresh);
        }
        return res.ok;
      } catch {
        return false;
      }
    },
    [slug, refreshEmbedToken],
  );

  const runChat = useCallback(
    async (question: string, assistantId: string, history: { role: 'user' | 'assistant'; content: string }[]) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const visitorId = visitorIdRef.current ?? (visitorIdRef.current = getOrCreateVisitorId());

      const postChat = (token: string) =>
        fetch(`/api/v1/chat?org=${encodeURIComponent(slug)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-chatmanta-embed': token,
            'x-chatmanta-visitor': visitorId,
          },
          body: JSON.stringify({ question, version: botVersion, history, threadId: threadIdRef.current }),
          signal: ctrl.signal,
        });

      const setAssistant = (patch: Partial<Msg>) =>
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === assistantId);
          if (idx < 0) return prev;
          const next = prev.slice();
          next[idx] = { ...next[idx], ...patch };
          return next;
        });

      try {
        let res = await postChat(embedTokenRef.current);
        // Verlopen token op een lang-open tab → eenmalig vers token + retry.
        if (res.status === 401 || res.status === 403) {
          const fresh = await refreshEmbedToken();
          if (fresh) res = await postChat(fresh);
        }
        if (!res.ok || !res.body) {
          setAssistant({
            content: 'Deze chat is even niet beschikbaar. Ververs de pagina en probeer het opnieuw.',
            error: true,
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
            let ev: { kind?: string; text?: string; response?: { answer?: string }; queryLogId?: string };
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.kind === 'meta') {
              // Eerste regel van de stream — koppel de query_log-id aan deze bubble
              // zodat de duim-knoppen er feedback aan kunnen hangen.
              if (typeof ev.queryLogId === 'string') patchMsg(assistantId, { queryLogId: ev.queryLogId });
            } else if (ev.kind === 'answer-start') {
              setAssistant({ content: '', streaming: true });
            } else if (ev.kind === 'answer-delta' && typeof ev.text === 'string') {
              setMessages((prev) => {
                const idx = prev.findIndex((m) => m.id === assistantId);
                if (idx < 0) return prev;
                const next = prev.slice();
                next[idx] = { ...next[idx], content: next[idx].content + ev.text, streaming: true };
                return next;
              });
            } else if (
              ev.kind === 'answer-done' ||
              ev.kind === 'smalltalk' ||
              ev.kind === 'fallback' ||
              ev.kind === 'replacement'
            ) {
              const answer = ev.response?.answer;
              if (typeof answer === 'string') setAssistant({ content: answer, streaming: false });
              else setAssistant({ streaming: false });
            } else if (ev.kind === 'error') {
              setAssistant({
                content: 'Er ging iets mis. Probeer het zo nog eens.',
                error: true,
                streaming: false,
              });
            }
          }
        }
        setAssistant({ streaming: false });
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setAssistant({ content: 'Verbinding viel weg — probeer het opnieuw.', error: true, streaming: false });
      } finally {
        setPending(false);
        abortRef.current = null;
      }
    },
    [slug, botVersion, refreshEmbedToken, patchMsg],
  );

  const send = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || pending) return;
    const userMsg: Msg = { id: makeId(), role: 'user', content: trimmed };
    const assistantId = makeId();
    const history = messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.streaming && !m.error))
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setPending(true);
    void runChat(trimmed, assistantId, history);
  }, [input, pending, messages, runChat]);

  // ---- styling ----
  const radius = isMobile ? 0 : 16;
  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    borderRadius: radius,
    overflow: 'hidden',
    boxShadow: isMobile ? 'none' : '0 12px 40px rgba(0,0,0,0.18)',
    fontFamily: 'system-ui, sans-serif',
  };
  const fabSide = position === 'bottom-left' ? { left: 24 } : { right: 24 };

  if (!open) {
    return (
      <div>
        {tooltipVisible && launcherText.trim() && (
          <div
            style={{
              position: 'fixed',
              bottom: 84,
              ...fabSide,
              maxWidth: 240,
              background: '#fff',
              color: '#111',
              padding: '8px 12px',
              borderRadius: 12,
              fontSize: 13,
              fontFamily: 'system-ui, sans-serif',
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            }}
          >
            {launcherText}
          </div>
        )}
        <button
          type="button"
          aria-label="Chat openen"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            bottom: 24,
            ...fabSide,
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: 'none',
            background: accentColor,
            color: fg,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <header
        style={{
          background: accentColor,
          color: fg,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>{headerTitle}</span>
        <button
          type="button"
          aria-label="Chat sluiten"
          onClick={() => setOpen(false)}
          style={{ background: 'transparent', border: 'none', color: fg, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}
        >
          ×
        </button>
      </header>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && welcomeMessage.trim() && (
          <Bubble role="assistant" accentColor={accentColor}>
            {welcomeMessage}
          </Bubble>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Bubble role={m.role} accentColor={accentColor} error={m.error} fg={fg}>
              {m.role === 'assistant'
                ? m.content
                  ? // linkify=false ALTIJD: widget-contract = sourceLinksEnabled UIT →
                    // links nooit klikbaar (label → platte tekst), óók niet bij een
                    // gedeelde answer_cache-hit die met sourceLinksEnabled=true schreef.
                    renderMarkdownLite(m.content, accentColor, false)
                  : m.streaming
                  ? '…'
                  : ''
                : m.content}
            </Bubble>
            {/* Feedback-knoppen: alleen op een afgerond, niet-fout antwoord met een
                queryLogId (= meta-event al binnen). */}
            {m.role === 'assistant' && !m.streaming && !m.error && m.queryLogId && (
              <FeedbackRow
                accentColor={accentColor}
                rating={m.feedbackRating}
                state={m.feedbackState}
                onRate={(rating) => void submitFeedback(m.id, m.queryLogId as string, rating)}
              />
            )}
          </div>
        ))}

        {/* Persoonlijk-contact: alleen als de org de feature aan heeft. */}
        {contactEnabled && messages.length > 0 && (
          contactDone ? (
            <div style={{ alignSelf: 'flex-start', fontSize: 13, color: '#15803d', padding: '4px 2px' }}>
              Bedankt! We nemen zo snel mogelijk contact met je op.
            </div>
          ) : contactOpen ? (
            <ContactForm
              accentColor={accentColor}
              fg={fg}
              onCancel={() => setContactOpen(false)}
              onSubmit={submitContact}
              onDone={() => {
                setContactOpen(false);
                setContactDone(true);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setContactOpen(true)}
              style={{
                alignSelf: 'flex-start',
                background: '#fff',
                border: `1px solid ${accentColor}`,
                color: accentColor,
                borderRadius: 10,
                padding: '7px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Liever persoonlijk contact?
            </button>
          )
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #eee', flexShrink: 0 }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Typ je vraag…"
          aria-label="Je vraag"
          style={{
            flex: 1,
            resize: 'none',
            padding: '10px 12px',
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 10,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          aria-label="Versturen"
          style={{
            background: accentColor,
            color: fg,
            border: 'none',
            borderRadius: 10,
            padding: '0 16px',
            cursor: pending || !input.trim() ? 'default' : 'pointer',
            opacity: pending || !input.trim() ? 0.6 : 1,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ➤
        </button>
      </form>
    </div>
  );
}

function Bubble({
  role,
  children,
  accentColor,
  error,
  fg,
}: {
  role: 'user' | 'assistant';
  children: React.ReactNode;
  accentColor: string;
  error?: boolean;
  fg?: string;
}) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        background: isUser ? accentColor : error ? '#fde8e8' : '#f1f1f3',
        color: isUser ? fg ?? '#fff' : error ? '#a11' : '#111',
        padding: '8px 12px',
        borderRadius: 14,
        fontSize: 14,
        lineHeight: 1.45,
        wordBreak: 'break-word',
      }}
    >
      {children}
    </div>
  );
}

function FeedbackRow({
  accentColor,
  rating,
  state,
  onRate,
}: {
  accentColor: string;
  rating?: 'up' | 'down';
  state?: 'sending' | 'sent' | 'error';
  onRate: (rating: 'up' | 'down') => void;
}) {
  if (state === 'sent') {
    return (
      <div style={{ alignSelf: 'flex-start', fontSize: 12, color: '#6b7280', padding: '2px' }}>
        Bedankt voor je feedback{rating === 'up' ? ' 👍' : rating === 'down' ? ' 👎' : ''}
      </div>
    );
  }
  const disabled = state === 'sending';
  const btn = (r: 'up' | 'down', label: string, glyph: string) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => onRate(r)}
      style={{
        background: rating === r ? accentColor : '#fff',
        color: rating === r ? bestForegroundOn(accentColor) : '#374151',
        border: '1px solid #d1d5db',
        borderRadius: 8,
        padding: '2px 8px',
        fontSize: 14,
        lineHeight: 1.4,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {glyph}
    </button>
  );
  return (
    <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
      {btn('up', 'Nuttig antwoord', '👍')}
      {btn('down', 'Niet nuttig', '👎')}
      {state === 'error' && <span style={{ fontSize: 11, color: '#b91c1c' }}>Niet gelukt — probeer opnieuw</span>}
    </div>
  );
}

function ContactForm({
  accentColor,
  fg,
  onCancel,
  onSubmit,
  onDone,
}: {
  accentColor: string;
  fg: string;
  onCancel: () => void;
  onSubmit: (payload: {
    name: string;
    email: string | null;
    phone: string | null;
    preferredContact: 'call' | 'email';
    subject: string | null;
    message: string | null;
    company_url: string;
  }) => Promise<boolean>;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [preferred, setPreferred] = useState<'email' | 'call'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  // Honeypot — onzichtbaar voor mensen; bots vullen 'm. Gaat 1:1 mee naar de route.
  const [honeypot, setHoneypot] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    name.trim().length > 0 &&
    consent &&
    (preferred === 'email' ? email.trim().length > 0 : phone.trim().length > 0);

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    const ok = await onSubmit({
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      preferredContact: preferred,
      subject: null,
      message: message.trim() || null,
      company_url: honeypot,
    });
    setSending(false);
    if (ok) onDone();
    else setError('Versturen lukte niet. Probeer het zo nog eens.');
  };

  const field: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    fontSize: 13,
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontFamily: 'inherit',
    outline: 'none',
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151' };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      style={{
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>Persoonlijk contact</div>

      {/* Honeypot: off-screen, niet focusbaar voor toetsenbord-gebruikers. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />

      <label style={label}>
        Naam
        <input style={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </label>

      <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="radio" name="prefer" checked={preferred === 'email'} onChange={() => setPreferred('email')} />
          E-mail
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="radio" name="prefer" checked={preferred === 'call'} onChange={() => setPreferred('call')} />
          Telefoon
        </label>
      </div>

      {preferred === 'email' ? (
        <label style={label}>
          E-mailadres
          <input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} />
        </label>
      ) : (
        <label style={label}>
          Telefoonnummer
          <input style={field} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
        </label>
      )}

      <label style={label}>
        Bericht (optioneel)
        <textarea
          style={{ ...field, resize: 'vertical', minHeight: 56 }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={4000}
        />
      </label>

      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#374151', cursor: 'pointer' }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
        <span>Ik geef toestemming om mijn gegevens te gebruiken om contact met mij op te nemen.</span>
      </label>

      {error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#6b7280',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Annuleren
        </button>
        <button
          type="submit"
          disabled={!valid || sending}
          style={{
            background: !valid || sending ? '#d1d5db' : accentColor,
            color: !valid || sending ? '#6b7280' : fg,
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: !valid || sending ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {sending ? 'Versturen…' : 'Versturen'}
        </button>
      </div>
    </form>
  );
}
