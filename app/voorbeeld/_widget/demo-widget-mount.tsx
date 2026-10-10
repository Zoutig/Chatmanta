'use client';

// De chatwidget op de voorbeeldwebsite. Zelfde weergave (WidgetView, mode "embed")
// en zelfde gedrag als de echte V1-widget (app/embed-v1/[slug]/v1-widget.tsx):
// streaming, Opnieuw proberen, tooltip, contactformulier. Verschillen:
//   - geen iframe: de website is van ons, dus de widget staat direct op de pagina;
//   - de instellingen komen uit de browser van de bezoeker (voorbeeld-dashboard),
//     dus elke wijziging daar werkt hier direct door, ook het uiterlijk;
//   - het contactformulier en de gesprekken landen in het voorbeeld-dashboard van
//     dezelfde bezoeker (demo-store), niet in een database.

import { useCallback, useEffect, useRef, useState } from 'react';
import { renderMarkdownLite } from '@/lib/widget/render-markdown-lite';
import { toWidgetAppearance } from '@/lib/v1/widget/appearance';
import { cleanHistory, isRetryable, retryTarget, type HistoryTurn } from '@/lib/v1/widget/chat-history';
import { WidgetView, type WidgetMessage } from '@/app/embed-v1/_widget/widget-view';
import { v1Font } from '@/app/v1/_ui/fonts';
import { ContactForm, type ContactPayload } from '@/app/embed-v1/_widget/contact-form';
import { streamDemoChat } from '@/lib/voorbeeld/demo-chat';
import {
  addDemoContactRequest,
  appendDemoTurn,
  readDemoSettings,
  useDemoSettings,
  useDemoWidgetState,
  useHydrated,
  writeDemoWidgetState,
} from '@/lib/voorbeeld/demo-store';

const MSG_BUSY = 'Het is nu erg druk. Probeer het zo opnieuw.';
const MSG_FAILED = 'Er ging iets mis. Probeer het zo nog eens.';
const MSG_DROPPED = 'De verbinding viel weg.';

const SESSION_KEY = 'chatmanta-voorbeeld:widget-sessie';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; streaming?: boolean; error?: boolean };
type Session = { threadId: string; messages: Msg[]; open: boolean; contactDone: boolean };

function makeId(): string {
  return crypto.randomUUID();
}

function loadSession(): Session | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s || typeof s.threadId !== 'string' || !Array.isArray(s.messages)) return null;
    // Een antwoord dat nog liep bij het verlaten van de pagina: weglaten.
    return { ...s, messages: s.messages.filter((m) => !(m.role === 'assistant' && (m.streaming || !m.content))) };
  } catch {
    return null;
  }
}

export function DemoWidgetMount() {
  const hydrated = useHydrated();
  const settings = useDemoSettings();
  const widget = useDemoWidgetState();
  const appearance = toWidgetAppearance(settings, 'De Duinhoeve');

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactDone, setContactDone] = useState(false);
  const threadIdRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const restoredRef = useRef(false);

  // Sessie herstellen (gesprek loopt door bij navigeren of herladen) + "laatst gezien"
  // voor het Widget-scherm in het dashboard.
  useEffect(() => {
    const s = loadSession();
    threadIdRef.current = s?.threadId ?? makeId();
    if (s) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(s.messages);
      setOpen(s.open);
      setContactDone(s.contactDone);
    }
    restoredRef.current = true;
    writeDemoWidgetState({ lastSeenAt: new Date().toISOString(), lastSeenOrigin: window.location.origin });
  }, []);

  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      const session: Session = { threadId: threadIdRef.current, messages, open, contactDone };
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* geen opslag: het gesprek blijft alleen op deze pagina */
    }
  }, [messages, open, contactDone]);

  // Mobiel = zelfde breekpunt als de loader van de echte widget (widget-v1.js).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Tooltip 1× tonen 4s na laden (alleen met launcher-tekst), dan weg.
  const launcherText = appearance.launcherText;
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

  // Op mobiel schermvullend: de pagina eronder niet laten scrollen.
  useEffect(() => {
    if (!(open && isMobile)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const runChat = useCallback(async (question: string, assistantId: string, history: HistoryTurn[]) => {
    const patch = (p: Partial<Msg>) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...p } : m)));
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await streamDemoChat({
        question,
        history,
        settings: readDemoSettings(),
        signal: ctrl.signal,
        onDelta: (text) => patch({ content: text }),
      });
      if (ctrl.signal.aborted) return;
      if (res.ok && res.answer.trim()) {
        patch({ content: res.answer, streaming: false });
        appendDemoTurn(threadIdRef.current, {
          question,
          answer: res.answer,
          kind: res.kind,
          unanswered: res.unanswered,
          sources: res.sources,
          at: new Date().toISOString(),
        });
      } else {
        const msg = !res.ok && res.error === 'RATE_LIMITED' ? MSG_BUSY : !res.ok && res.error === 'THROWN' ? MSG_DROPPED : MSG_FAILED;
        patch({ content: msg, error: true, streaming: false });
      }
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setPending(false);
      }
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;
      const assistantId = makeId();
      const history = cleanHistory(messages);
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: 'user', content: trimmed },
        { id: assistantId, role: 'assistant', content: '', streaming: true },
      ]);
      setPending(true);
      void runChat(trimmed, assistantId, history);
    },
    [pending, messages, runChat],
  );

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

  const submitContact = useCallback(async (p: ContactPayload): Promise<boolean> => {
    // Honeypot gevuld: doen alsof het lukte (zelfde gedrag als de echte route).
    if (p.company_url) return true;
    await new Promise((r) => setTimeout(r, 500));
    addDemoContactRequest({
      name: p.name,
      email: p.email,
      phone: p.phone,
      preferredContact: p.preferredContact,
      subject: p.subject,
      message: p.message,
    });
    return true;
  }, []);

  // Op pauze gezet in het dashboard: geen chatknop (zoals de echte widget).
  if (!hydrated || !widget.isActive) return null;

  const view: WidgetMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    streaming: m.streaming,
    error: m.error,
    retryable: m.error && isRetryable(messages, m.id),
    content:
      m.role === 'assistant' && m.content && !m.error
        ? renderMarkdownLite(m.content, appearance.accentColor, false)
        : m.content,
  }));

  const contactSlot =
    settings.contactRequestsEnabled && messages.length > 0 ? (
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
    <div className={v1Font.variable} style={{ position: 'relative', zIndex: 2147483000 }}>
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
        autoFocus={!isMobile}
      />
    </div>
  );
}
