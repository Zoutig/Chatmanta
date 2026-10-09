'use client';

// V1 Preview: dezelfde WidgetView als de echte widget (mode "contained", binnen
// de nep-website), maar via de server-action askV1 i.p.v. de publieke stream.
// Multi-turn gesprek persisteert in localStorage per org+chatbot.

import { useEffect, useRef, useState, useTransition } from 'react';
import { renderMarkdownLite } from '@/lib/widget/render-markdown-lite';
import type { WidgetAppearance } from '@/lib/v1/widget/appearance';
import { cleanHistory, isRetryable, retryTarget, type HistoryTurn } from '@/lib/v1/widget/chat-history';
import { WidgetView, type WidgetMessage } from '@/app/embed-v1/_widget/widget-view';
import { askV1, type AskV1Result } from '../actions';

type ErrorCode = Extract<AskV1Result, { ok: false }>['error'] | 'THROWN';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  code?: ErrorCode;
};

// v1 → v2: berichten dragen nu error/code. Oude v1-opslag wordt ingelezen; oude
// foutbubbels herkennen we aan hun tekst.
const STORAGE_VERSION = 2;
const storageKey = (orgId: string, chatbotId: string, v = STORAGE_VERSION) =>
  `v1-preview-chat:v${v}:${orgId}:${chatbotId}`;
const LEGACY_ERROR_PREFIX = 'Er ging iets mis';

// Aantal turns dat als history naar askV1 gaat; spiegelt de server-side cap.
const HISTORY_TURNS_FOR_RAG = 10;

// Alleen tijdelijke fouten krijgen "Opnieuw proberen".
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['FAILED', 'RATE_LIMITED', 'THROWN']);

function errorLabel(code: ErrorCode): string {
  switch (code) {
    case 'NO_CHATBOT':       return 'Er is nog geen chatbot ingesteld.';
    case 'FORBIDDEN':        return 'Je hebt geen toegang tot deze chatbot.';
    case 'RATE_LIMITED':     return 'Het is nu erg druk. Probeer het zo opnieuw.';
    case 'MONTHLY_LIMIT':    return 'De maandelijkse gesprekslimiet is bereikt.';
    case 'BUDGET_EXHAUSTED': return 'De daglimiet van deze chatbot is bereikt.';
    case 'ORG_SUSPENDED':    return 'Deze chatbot is momenteel niet beschikbaar.';
    case 'THROWN':           return 'De verbinding viel weg.';
    case 'FAILED':
    default:                 return 'Er ging iets mis. Probeer het zo nog eens.';
  }
}

function parseStored(raw: string | null): Message[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Message[] = [];
    for (const m of parsed) {
      if (!m || typeof m !== 'object') continue;
      const { id, role, content, error, code } = m as Record<string, unknown>;
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || typeof id !== 'string') continue;
      // Een antwoord dat nog liep toen de pagina sloot: weglaten, anders blijft
      // er een eeuwige typ-indicator staan.
      if (role === 'assistant' && !content.trim()) continue;
      const legacyError = role === 'assistant' && error === undefined && content.startsWith(LEGACY_ERROR_PREFIX);
      out.push({
        id,
        role,
        // Oude foutbubbel: reden behouden (zonder het dubbele voorvoegsel), geen
        // code → niet opnieuw te proberen (kan een limietfout zijn geweest).
        content: legacyError ? content.replace(/^Er ging iets mis:\s*/, '') : content,
        error: error === true || legacyError,
        code: typeof code === 'string' ? (code as ErrorCode) : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function loadStored(orgId: string, chatbotId: string): Message[] {
  try {
    const current = window.localStorage.getItem(storageKey(orgId, chatbotId));
    if (current) return parseStored(current);
    return parseStored(window.localStorage.getItem(storageKey(orgId, chatbotId, 1)));
  } catch {
    return [];
  }
}

function saveStored(orgId: string, chatbotId: string, messages: Message[]) {
  try {
    if (messages.length === 0) window.localStorage.removeItem(storageKey(orgId, chatbotId));
    else window.localStorage.setItem(storageKey(orgId, chatbotId), JSON.stringify(messages));
    window.localStorage.removeItem(storageKey(orgId, chatbotId, 1));
  } catch {
    // Quota/serialize-fouten: stil doorgaan.
  }
}

export function V1PreviewWidget({
  orgId,
  chatbotId,
  appearance,
}: {
  orgId: string;
  chatbotId: string;
  appearance: WidgetAppearance;
}) {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pending, startTransition] = useTransition();
  const idRef = useRef(0);
  const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++idRef.current}`;

  // Hydreer uit localStorage na mount: voorkomt een SSR/CSR-mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loadStored(orgId, chatbotId));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [orgId, chatbotId]);

  useEffect(() => {
    if (hydrated) saveStored(orgId, chatbotId, messages);
  }, [messages, hydrated, orgId, chatbotId]);

  function ask(question: string, history: HistoryTurn[], replaceId?: string) {
    const pendingId = nextId('a');
    setMessages((prev) => {
      const placeholder: Message = { id: pendingId, role: 'assistant', content: '' };
      return replaceId ? prev.map((m) => (m.id === replaceId ? placeholder : m)) : [...prev, placeholder];
    });
    startTransition(async () => {
      let next: Message;
      try {
        const res = await askV1(question, history.slice(-HISTORY_TURNS_FOR_RAG * 2));
        next = res.ok
          ? { id: pendingId, role: 'assistant', content: res.answer }
          : { id: pendingId, role: 'assistant', content: errorLabel(res.error), error: true, code: res.error };
      } catch {
        next = { id: pendingId, role: 'assistant', content: errorLabel('THROWN'), error: true, code: 'THROWN' };
      }
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? next : m)));
    });
  }

  function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    const history = cleanHistory(messages);
    setMessages((prev) => [...prev, { id: nextId('u'), role: 'user', content: q }]);
    ask(q, history);
  }

  function retry(errorId: string) {
    if (pending) return;
    const target = retryTarget(messages, errorId);
    if (target) ask(target.question, target.history, errorId);
  }

  const view: WidgetMessage[] = messages.map((m) => {
    const waiting = m.role === 'assistant' && !m.content && !m.error;
    return {
      id: m.id,
      role: m.role,
      streaming: waiting,
      error: m.error,
      retryable: m.error && !!m.code && RETRYABLE.has(m.code) && isRetryable(messages, m.id),
      content:
        m.role === 'assistant' && m.content && !m.error
          ? renderMarkdownLite(m.content, appearance.accentColor, false)
          : m.content,
    };
  });

  return (
    <WidgetView
      appearance={appearance}
      mode="contained"
      open={open}
      onOpenChange={setOpen}
      messages={view}
      pending={pending}
      onSend={send}
      onRetry={retry}
    />
  );
}
