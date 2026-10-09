'use client';

// V1-widget in de iframe van public/widget-v1.js: launcher → chatpaneel →
// NDJSON-streaming chat, met token-refresh-op-401 en postMessage-resize naar de
// loader. De weergave is de gedeelde WidgetView (bord B · Diepzee); hier zit
// alleen de logica. Bewust geen V0-extra's (thread-drawer, duimpjes, org-skins).

import { useCallback, useEffect, useRef, useState } from 'react';
import { renderMarkdownLite } from '@/lib/widget/render-markdown-lite';
import { getOrCreateVisitorId } from '@/lib/widget/visitor-id';
import type { WidgetAppearance } from '@/lib/v1/widget/appearance';
import { cleanHistory, isRetryable, retryTarget, type HistoryTurn } from '@/lib/v1/widget/chat-history';
import { WidgetView, type WidgetMessage } from '../_widget/widget-view';
import { ContactForm, type ContactPayload } from '../_widget/contact-form';

export type V1WidgetProps = {
  slug: string;
  embedToken: string;
  botVersion: string;
  /** Alleen publieke merk-velden; opgebouwd via toWidgetAppearance (expliciet per veld). */
  appearance: WidgetAppearance;
  /**
   * Toont de "persoonlijk contact"-knop + -formulier. Default false → fail-closed.
   * De submit-route (/api/v1/contact-request) is de autoritatieve gate; dit is
   * enkel de UI-zichtbaarheid.
   */
  contactRequestsEnabled?: boolean;
};

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
  // queryLogId komt binnen via het 'meta'-event (eerste regel van de stream).
  // De duimpjes zijn bewust verwijderd (soft-launch 2026-10-06); de koppeling
  // blijft staan zodat ze zonder stream-wijziging terug kunnen.
  queryLogId?: string;
};

// We posten naar de loader met targetOrigin '*': de signalen (ready/resize) zijn
// niet-gevoelig, en de loader valideert zelf e.origin vóór hij iets doet.
const PARENT_TARGET = '*';

// Het paneel mag pas animeren als de loader de iframe op open-formaat heeft
// gezet; anders begint de animatie in de 110×110-iframe.
const OPEN_MIN_HEIGHT = 200;
const READY_FALLBACK_MS = 300;

const MSG_UNAVAILABLE = 'Deze chat is even niet beschikbaar.';
const MSG_FAILED = 'Er ging iets mis. Probeer het zo nog eens.';
const MSG_DROPPED = 'De verbinding viel weg.';

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export function V1Widget(props: V1WidgetProps) {
  const { slug, botVersion, appearance } = props;
  const { accentColor, position, launcherText } = appearance;
  const contactEnabled = props.contactRequestsEnabled === true;

  // Heartbeat: één ping bij mount (V0-embed-parity). host komt uit ?h= dat de
  // loader meegaf; voedt widget_last_seen_at voor Live-status + admin-widgetStatus.
  useEffect(() => {
    const host = new URLSearchParams(window.location.search).get('h') ?? undefined;
    void fetch(`/api/v1/widget/ping?org=${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatmanta-embed': props.embedToken,
      },
      body: JSON.stringify({ host }),
    }).catch(() => {
      // best-effort
    });
  }, [props.embedToken, slug]);

  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  // Contact-formulier: dicht/open/verzonden. Eén sessie = één verzending.
  const [contactOpen, setContactOpen] = useState(false);
  const [contactDone, setContactDone] = useState(false);

  const embedTokenRef = useRef(props.embedToken);
  const visitorIdRef = useRef<string | null>(null);
  // Stabiele sessie-thread-id (één per widget-mount). Gaat als threadId mee in elke
  // chat-POST zodat de turns server-side in één thread landen. Geen autorisatie-rol.
  const threadIdRef = useRef<string>(makeId());
  const abortRef = useRef<AbortController | null>(null);

  // Host-grootte: de iframe-viewport zegt niets over het echte scherm. De loader
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
      /* parent niet bereikbaar: init uit ?m=1 blijft staan */
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

  // Open-animatie pas starten als de iframe echt groot is (resize-event), met een
  // vangnet-timer. Sluiten gaat direct.
  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    const big = () => window.innerHeight > OPEN_MIN_HEIGHT;
    if (big()) {
      setReady(true);
      return;
    }
    const onResize = () => {
      if (big()) setReady(true);
    };
    window.addEventListener('resize', onResize);
    const t = setTimeout(() => setReady(true), READY_FALLBACK_MS);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, [open]);

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

  // Contactformulier → /api/v1/contact-request. Spiegelt de chat-fetch: zelfde
  // org-slug, x-chatmanta-embed-token, en 401→token-refresh→1×-retry zodat een traag
  // ingevuld formulier de lead niet kost op een verlopen 30-min-token. consentGiven
  // hard true (de route + DB-CHECK borgen het ook). Geeft true bij 200/201.
  const submitContact = useCallback(
    async (payload: ContactPayload): Promise<boolean> => {
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
    async (question: string, assistantId: string, history: HistoryTurn[]) => {
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

      const patch = (p: Partial<Msg> | ((m: Msg) => Partial<Msg>)) =>
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === assistantId);
          if (idx < 0) return prev;
          const next = prev.slice();
          next[idx] = { ...next[idx], ...(typeof p === 'function' ? p(next[idx]) : p) };
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
          patch({ content: MSG_UNAVAILABLE, error: true, streaming: false });
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
              // Eerste regel van de stream: koppel de query_log-id aan deze bubbel.
              if (typeof ev.queryLogId === 'string') patch({ queryLogId: ev.queryLogId });
            } else if (ev.kind === 'answer-start') {
              patch({ content: '', streaming: true });
            } else if (ev.kind === 'answer-delta' && typeof ev.text === 'string') {
              const delta = ev.text;
              patch((m) => ({ content: m.content + delta, streaming: true }));
            } else if (
              ev.kind === 'answer-done' ||
              ev.kind === 'smalltalk' ||
              ev.kind === 'fallback' ||
              ev.kind === 'replacement'
            ) {
              const answer = ev.response?.answer;
              if (typeof answer === 'string') patch({ content: answer, streaming: false });
              else patch({ streaming: false });
            } else if (ev.kind === 'error') {
              patch({ content: MSG_FAILED, error: true, streaming: false });
            }
          }
        }
        // Stream klaar zonder antwoord → als fout tonen (met Opnieuw proberen),
        // niet als lege witte bubbel.
        patch((m) =>
          m.error || m.content.trim()
            ? { streaming: false }
            : { content: MSG_FAILED, error: true, streaming: false },
        );
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        patch({ content: MSG_DROPPED, error: true, streaming: false });
      } finally {
        setPending(false);
        abortRef.current = null;
      }
    },
    [slug, botVersion, refreshEmbedToken],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;
      const userMsg: Msg = { id: makeId(), role: 'user', content: trimmed };
      const assistantId = makeId();
      const history = cleanHistory(messages);
      setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', streaming: true }]);
      setPending(true);
      void runChat(trimmed, assistantId, history);
    },
    [pending, messages, runChat],
  );

  // Opnieuw proberen: alleen op de laatste foutbubbel. Die wordt vervangen door
  // een nieuwe lege antwoordbubbel; zelfde chatpad, zelfde token-refresh.
  const retry = useCallback(
    (errorId: string) => {
      if (pending) return;
      const target = retryTarget(messages, errorId);
      if (!target) return;
      const assistantId = makeId();
      setMessages((prev) =>
        prev.map((m) => (m.id === errorId ? { id: assistantId, role: 'assistant', content: '', streaming: true } : m)),
      );
      setPending(true);
      void runChat(target.question, assistantId, target.history);
    },
    [pending, messages, runChat],
  );

  const view: WidgetMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    streaming: m.streaming,
    error: m.error,
    retryable: m.error && isRetryable(messages, m.id),
    content:
      m.role === 'assistant' && m.content && !m.error
        ? // linkify=false ALTIJD: widget-contract = sourceLinksEnabled UIT →
          // links nooit klikbaar (label → platte tekst), ook niet bij een
          // gedeelde answer_cache-hit die met sourceLinksEnabled=true schreef.
          renderMarkdownLite(m.content, accentColor, false)
        : m.content,
  }));

  // Persoonlijk contact: alleen als de org de feature aan heeft.
  const contactSlot =
    contactEnabled && messages.length > 0 ? (
      contactDone ? (
        <div className="cmw-thanks" role="status">
          Bedankt! We nemen zo snel mogelijk contact met je op.
        </div>
      ) : contactOpen ? (
        <ContactForm
          onCancel={() => setContactOpen(false)}
          onSubmit={submitContact}
          onDone={() => {
            setContactOpen(false);
            setContactDone(true);
          }}
        />
      ) : (
        <button type="button" className="cmw-soft-btn" onClick={() => setContactOpen(true)}>
          Liever persoonlijk contact?
        </button>
      )
    ) : null;

  return (
    <WidgetView
      appearance={appearance}
      mode="embed"
      isMobile={isMobile}
      open={open}
      onOpenChange={setOpen}
      messages={view}
      pending={pending}
      onSend={send}
      onRetry={retry}
      peek={tooltipVisible}
      belowMessages={contactSlot}
      ready={ready}
      autoFocus={!isMobile}
    />
  );
}
