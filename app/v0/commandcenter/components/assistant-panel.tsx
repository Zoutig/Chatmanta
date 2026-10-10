'use client';

// AssistantPanel — rechts-paneel binnen CommandShell, GPT-4o-chatbot met
// tool-calling.
//
// Eén bestand om prop-drilling te vermijden; sub-componenten zijn lokaal.
// Style-strategie: inline styles, consistent met command-shell.tsx (Tailwind
// v4 PostCSS-quirk in memory: nieuwe globals.css-properties worden soms gedropt).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/svg-icons';
import type { AssistantMessage, AssistantThread } from '@/lib/commandcenter/types';
import {
  listThreadMessagesAction,
  listThreadsAction,
  deleteThreadAction,
} from '@/app/actions/commandcenter-assistant';

const ACCENT = 'var(--manta-accent, var(--accent))';

const STORE_COLLAPSED = 'cc-assistant-collapsed';
const STORE_WIDTH = 'cc-assistant-width';
const STORE_THREAD = 'cc-assistant-thread';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const COLLAPSED_WIDTH = 44;
const UNDO_WINDOW_MS = 10_000;

// ---------------------------------------------------------------------------
// Bubble-types (client-side render-model)
// ---------------------------------------------------------------------------

type ToolItem = {
  kind: 'tool';
  id: string; // tool_call_id
  messageId?: string; // server-side cc_assistant_messages.id (= undo_token)
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'ok' | 'error';
  item?: unknown;
  error?: string;
  undoToken?: string;
  undoExpiresAt?: number;
  undone?: boolean;
};

type Bubble =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | ToolItem
  | { kind: 'error'; id: string; text: string };

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AssistantPanel() {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [composerValue, setComposerValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ---- LocalStorage hydration -----------------------------------------------
  useEffect(() => {
    try {
      const c = localStorage.getItem(STORE_COLLAPSED);
      if (c === '1') setCollapsed(true);
      const w = Number(localStorage.getItem(STORE_WIDTH));
      if (w >= MIN_WIDTH && w <= MAX_WIDTH) setWidth(w);
      const tid = localStorage.getItem(STORE_THREAD);
      if (tid) setActiveThreadId(tid);
    } catch {
      // localStorage unavailable — ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_COLLAPSED, collapsed ? '1' : '0');
    } catch {}
  }, [collapsed]);
  useEffect(() => {
    try {
      localStorage.setItem(STORE_WIDTH, String(width));
    } catch {}
  }, [width]);
  useEffect(() => {
    try {
      if (activeThreadId) localStorage.setItem(STORE_THREAD, activeThreadId);
      else localStorage.removeItem(STORE_THREAD);
    } catch {}
  }, [activeThreadId]);

  // ---- Threads list ---------------------------------------------------------
  const reloadThreads = useCallback(async () => {
    const res = await listThreadsAction();
    if (res.ok && 'threads' in res) {
      setThreads(res.threads as AssistantThread[]);
    }
  }, []);

  useEffect(() => {
    void reloadThreads();
  }, [reloadThreads]);

  // ---- Active-thread message hydration --------------------------------------
  useEffect(() => {
    if (!activeThreadId) {
      setBubbles([]);
      return;
    }
    void (async () => {
      const res = await listThreadMessagesAction(activeThreadId);
      if (res.ok && 'messages' in res) {
        const msgs = res.messages as AssistantMessage[];
        setBubbles(messagesToBubbles(msgs));
      }
    })();
  }, [activeThreadId]);

  // ---- Auto-scroll ----------------------------------------------------------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [bubbles, isStreaming]);

  // ---- Undo-window countdown ticker -----------------------------------------
  const [, forceTick] = useState(0);
  useEffect(() => {
    const hasPending = bubbles.some(
      (b) => b.kind === 'tool' && b.undoToken && b.undoExpiresAt && b.undoExpiresAt > Date.now() && !b.undone,
    );
    if (!hasPending) return;
    const t = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [bubbles]);

  // ---- Event handler (declared BEFORE sendMessage zodat dep-array werkt) ----
  const handleEvent = useCallback((ev: Record<string, unknown>) => {
    const type = ev.type as string;
    if (type === 'thread') {
      const t = ev.thread as { id: string; title: string };
      setActiveThreadId(t.id);
    } else if (type === 'tool_call') {
      const id = ev.id as string;
      const name = ev.name as string;
      const args = (ev.args ?? {}) as Record<string, unknown>;
      setBubbles((prev) => [
        ...prev,
        { kind: 'tool', id, name, args, status: 'pending' },
      ]);
    } else if (type === 'tool_result') {
      const tcId = ev.tool_call_id as string;
      const messageId = ev.message_id as string | undefined;
      const ok = ev.ok as boolean;
      const item = ev.item;
      const error = ev.error as string | undefined;
      const undoToken = ev.undo_token as string | undefined;
      setBubbles((prev) =>
        prev.map((b) =>
          b.kind === 'tool' && b.id === tcId
            ? {
                ...b,
                messageId,
                status: ok ? 'ok' : 'error',
                item,
                error,
                undoToken,
                undoExpiresAt: undoToken ? Date.now() + UNDO_WINDOW_MS : undefined,
              }
            : b,
        ),
      );
      // Server-state heeft mogelijk gemuteerd → revalidate andere cc-pages
      router.refresh();
    } else if (type === 'text') {
      const content = (ev.content as string) ?? '';
      if (content.trim()) {
        setBubbles((prev) => [
          ...prev,
          { kind: 'assistant', id: 'a_' + Date.now(), text: content },
        ]);
      }
    } else if (type === 'error') {
      const message = (ev.message as string) ?? 'onbekende fout';
      setBubbles((prev) => [
        ...prev,
        { kind: 'error', id: 'e_' + Date.now(), text: message },
      ]);
    }
  }, [router]);

  // ---- Send message ---------------------------------------------------------
  const sendMessage = useCallback(async () => {
    const text = composerValue.trim();
    if (!text || isStreaming) return;
    setComposerValue('');
    const userBubbleId = 'u_' + Date.now();
    setBubbles((prev) => [...prev, { kind: 'user', id: userBubbleId, text }]);
    setIsStreaming(true);

    try {
      const res = await fetch('/api/commandcenter/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: activeThreadId ?? undefined,
          message: text,
        }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.text();
        setBubbles((prev) => [
          ...prev,
          { kind: 'error', id: 'e_' + Date.now(), text: `Fout: ${msg.slice(0, 200)}` },
        ]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nlIdx = buffer.indexOf('\n');
        while (nlIdx !== -1) {
          const line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          nlIdx = buffer.indexOf('\n');
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as Record<string, unknown>;
            handleEvent(ev);
          } catch {
            // skip malformed line
          }
        }
      }
    } catch (err) {
      setBubbles((prev) => [
        ...prev,
        {
          kind: 'error',
          id: 'e_' + Date.now(),
          text: err instanceof Error ? err.message : 'Onbekende netwerk-fout',
        },
      ]);
    } finally {
      setIsStreaming(false);
      void reloadThreads();
    }
  }, [composerValue, isStreaming, activeThreadId, reloadThreads, handleEvent]);

  // ---- Undo ------------------------------------------------------------------
  const handleUndo = useCallback(async (toolCallId: string, undoToken: string) => {
    try {
      const res = await fetch('/api/commandcenter/assistant/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ undo_token: undoToken }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setBubbles((prev) =>
          prev.map((b) =>
            b.kind === 'tool' && b.id === toolCallId
              ? { ...b, error: data.error ?? 'undo mislukt' }
              : b,
          ),
        );
        return;
      }
      setBubbles((prev) =>
        prev.map((b) =>
          b.kind === 'tool' && b.id === toolCallId
            ? { ...b, undone: true, undoToken: undefined, undoExpiresAt: undefined }
            : b,
        ),
      );
      router.refresh();
    } catch (err) {
      console.error('[undo]', err);
    }
  }, [router]);

  // ---- New thread ------------------------------------------------------------
  const handleNewThread = useCallback(() => {
    setActiveThreadId(null);
    setBubbles([]);
  }, []);

  // ---- Resize handle ---------------------------------------------------------
  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (mv: MouseEvent) => {
      const dx = startX - mv.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + dx));
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width]);

  // ---- Render ----------------------------------------------------------------
  if (collapsed) {
    return (
      <aside
        style={{
          width: COLLAPSED_WIDTH,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '14px 0',
        }}
      >
        <button
          aria-label="Open assistent"
          onClick={() => setCollapsed(false)}
          style={iconButtonStyle()}
          title="Open assistent"
        >
          <Icon name="panel-right" size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      style={{
        position: 'sticky',
        top: 0,
        alignSelf: 'start',
        width,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleResize}
        style={{
          position: 'absolute',
          left: -3,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'ew-resize',
          zIndex: 2,
        }}
        aria-label="Versleep om paneel-breedte te wijzigen"
      />

      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: ACCENT,
            boxShadow: `0 0 8px ${ACCENT}`,
          }}
        />
        <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>Assistent</span>
        <button
          onClick={handleNewThread}
          style={iconButtonStyle()}
          title="Nieuwe chat"
          aria-label="Nieuwe chat"
        >
          <Icon name="plus" size={16} />
        </button>
        <button
          onClick={() => setCollapsed(true)}
          style={iconButtonStyle()}
          title="Paneel inklappen"
          aria-label="Paneel inklappen"
        >
          <Icon name="caret" size={14} />
        </button>
      </div>

      {/* Thread switcher */}
      <ThreadSwitcher
        threads={threads}
        activeId={activeThreadId}
        onSelect={setActiveThreadId}
        onDelete={async (id) => {
          await deleteThreadAction(id);
          if (activeThreadId === id) handleNewThread();
          void reloadThreads();
        }}
      />

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 14px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {bubbles.length === 0 && (
          <div
            style={{
              color: 'var(--fg-muted)',
              fontSize: 13,
              lineHeight: 1.5,
              padding: '40px 6px',
            }}
          >
            <strong style={{ color: 'var(--fg)' }}>Wat wil je kwijt?</strong>
            <br />
            Vertel wat er gedaan is of nog moet, ik maak/wijzig taken en check-ins.
            <br />
            <span style={{ color: 'var(--fg-faint)' }}>
              &ldquo;Maak P1 taak voor Niels: Vercel-billing checken voor 30
              mei.&rdquo;
            </span>
          </div>
        )}
        {bubbles.map((b) => (
          <BubbleRow key={b.id} b={b} now={Date.now()} onUndo={handleUndo} />
        ))}
        {isStreaming && (
          <div style={{ color: 'var(--fg-muted)', fontSize: 12, padding: '4px 6px' }}>
            <span style={{ opacity: 0.7 }}>denken…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div
        style={{
          padding: '12px 12px 14px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg)',
        }}
      >
        <textarea
          value={composerValue}
          onChange={(e) => setComposerValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void sendMessage();
            }
          }}
          disabled={isStreaming}
          placeholder="Typ iets (Ctrl/Cmd+Enter om te sturen)..."
          rows={3}
          style={{
            width: '100%',
            background: 'var(--surface)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 13,
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={() => void sendMessage()}
            disabled={!composerValue.trim() || isStreaming}
            style={{
              background: ACCENT,
              color: '#02060c',
              border: 'none',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: composerValue.trim() && !isStreaming ? 'pointer' : 'not-allowed',
              opacity: composerValue.trim() && !isStreaming ? 1 : 0.5,
            }}
          >
            Stuur
          </button>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Houdt UI-cap in sync met server-side MAX_ACTIVE_THREADS in
// lib/commandcenter/server/assistant-threads.ts. Hard-coded ipv import om geen
// extra client/server boundary te kruisen.
const VISIBLE_THREADS = 3;

function ThreadSwitcher({
  threads,
  activeId,
  onSelect,
  onDelete,
}: {
  threads: AssistantThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (threads.length === 0) return null;
  const recent = threads.slice(0, VISIBLE_THREADS);
  return (
    <div
      style={{
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      {recent.map((t) => {
        const isActive = activeId === t.id;
        const border = isActive
          ? `color-mix(in oklab, ${ACCENT} 40%, transparent)`
          : 'var(--border)';
        const bg = isActive
          ? `color-mix(in oklab, ${ACCENT} 18%, transparent)`
          : 'var(--surface)';
        return (
          <div
            key={t.id}
            role="group"
            aria-label={t.title}
            style={{
              display: 'inline-flex',
              alignItems: 'stretch',
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 999,
              maxWidth: 180,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onDelete(t.id);
                }
              }}
              title={t.title}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '3px 4px 3px 10px',
                fontSize: 11.5,
                color: 'var(--fg)',
                cursor: 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 140,
                textAlign: 'left',
              }}
            >
              {t.title}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(t.id);
              }}
              title="Gesprek verwijderen"
              aria-label={`Gesprek "${t.title}" verwijderen`}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0 8px 0 4px',
                color: 'var(--fg-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-muted)';
              }}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function BubbleRow({
  b,
  now,
  onUndo,
}: {
  b: Bubble;
  now: number;
  onUndo: (toolCallId: string, undoToken: string) => void;
}) {
  if (b.kind === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '90%' }}>
        <div
          style={{
            background: `color-mix(in oklab, ${ACCENT} 22%, transparent)`,
            border: `1px solid color-mix(in oklab, ${ACCENT} 30%, transparent)`,
            color: 'var(--fg)',
            padding: '7px 11px',
            borderRadius: 12,
            fontSize: 13,
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
          }}
        >
          {b.text}
        </div>
      </div>
    );
  }
  if (b.kind === 'assistant') {
    return (
      <div style={{ alignSelf: 'flex-start', maxWidth: '95%' }}>
        <div
          style={{
            color: 'var(--fg)',
            padding: '4px 2px',
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {b.text}
        </div>
      </div>
    );
  }
  if (b.kind === 'error') {
    return (
      <div
        style={{
          alignSelf: 'stretch',
          background: 'color-mix(in oklab, var(--err) 14%, transparent)',
          border: '1px solid color-mix(in oklab, var(--err) 40%, transparent)',
          color: 'var(--err)',
          padding: '6px 10px',
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        {b.text}
      </div>
    );
  }
  // tool
  return <ToolCard b={b} now={now} onUndo={onUndo} />;
}

function ToolCard({
  b,
  now,
  onUndo,
}: {
  b: ToolItem;
  now: number;
  onUndo: (toolCallId: string, undoToken: string) => void;
}) {
  const isWrite = b.name.startsWith('create_') || b.name.startsWith('update_') ||
    b.name.startsWith('delete_') || b.name.startsWith('complete_');
  const showUndo =
    b.undoToken && !b.undone && b.undoExpiresAt && b.undoExpiresAt > now;
  const secsLeft = showUndo ? Math.max(0, Math.ceil(((b.undoExpiresAt ?? 0) - now) / 1000)) : 0;

  const label = describeToolCall(b);

  let statusGlyph = '⋯';
  let statusColor = 'var(--fg-muted)';
  if (b.status === 'ok') {
    statusGlyph = b.undone ? '↺' : '✓';
    statusColor = b.undone ? 'var(--fg-muted)' : isWrite ? 'var(--ok)' : 'var(--fg-muted)';
  } else if (b.status === 'error') {
    statusGlyph = '✕';
    statusColor = 'var(--err)';
  }

  return (
    <div
      style={{
        alignSelf: 'stretch',
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ color: statusColor, fontWeight: 700, width: 12 }}>{statusGlyph}</span>
      <span style={{ flex: 1, color: 'var(--fg)' }}>{label}</span>
      {b.error && <span style={{ color: 'var(--err)' }}>{b.error}</span>}
      {showUndo && (
        <button
          onClick={() => onUndo(b.id, b.undoToken!)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--fg)',
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Ongedaan ({secsLeft}s)
        </button>
      )}
      {b.undone && <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>ongedaan</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function iconButtonStyle(): React.CSSProperties {
  return {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--fg)',
    borderRadius: 8,
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  };
}

function describeToolCall(b: ToolItem): string {
  const it = (b.item ?? {}) as Record<string, unknown>;
  const title = typeof it.title === 'string' ? it.title : undefined;
  const owner = typeof it.owner === 'string' ? it.owner : undefined;
  switch (b.name) {
    case 'create_task':
      return `Taak aangemaakt: ${title ?? '(?)'}${owner ? ` — ${owner}` : ''}`;
    case 'update_task':
      return `Taak bijgewerkt: ${title ?? '(?)'}`;
    case 'complete_task':
      return `Taak voltooid: ${title ?? '(?)'}`;
    case 'delete_task':
      return `Taak verwijderd: ${title ?? '(?)'}`;
    case 'create_checkin':
      return `Check-in vastgelegd: ${(it.week as string) ?? ''}`;
    case 'create_decision':
      return `Beslissing vastgelegd: ${title ?? ''}`;
    case 'list_tasks': {
      const c = typeof it.count === 'number' ? it.count : '?';
      return `Bekeek taken (${c})`;
    }
    case 'list_milestones':
      return 'Bekeek milestones';
    case 'list_recent_checkins':
      return 'Bekeek recente check-ins';
    case 'list_open_decisions':
      return 'Bekeek open beslissingen';
    case 'list_test_customers':
      return 'Bekeek testklanten';
    case 'get_owner_workload':
      return `Workload van ${(b.args.owner as string) ?? '?'} bekeken`;
    default:
      return b.name;
  }
}

function messagesToBubbles(msgs: AssistantMessage[]): Bubble[] {
  const out: Bubble[] = [];
  // Map tool-call-id → tool-card (om result te kunnen mergen)
  const cards = new Map<string, ToolItem>();
  for (const m of msgs) {
    if (m.role === 'user' && m.content) {
      out.push({ kind: 'user', id: m.id, text: m.content });
    } else if (m.role === 'assistant') {
      // Eerst tool-calls (als die er zijn) als pending cards toevoegen
      if (m.toolCalls && m.toolCalls.length > 0) {
        for (const tc of m.toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
          } catch {
            args = {};
          }
          const card: ToolItem = {
            kind: 'tool',
            id: tc.id,
            name: tc.function.name,
            args,
            status: 'pending',
          };
          cards.set(tc.id, card);
          out.push(card);
        }
      }
      if (m.content && m.content.trim()) {
        out.push({ kind: 'assistant', id: m.id, text: m.content });
      }
    } else if (m.role === 'tool' && m.toolCallId) {
      const card = cards.get(m.toolCallId);
      const result = m.toolResult;
      if (card) {
        card.messageId = m.id;
        card.status = result?.ok ? 'ok' : 'error';
        card.item = result?.item;
        card.error = result?.error;
        card.undone = result?.undone;
        // Geen undoToken meer bij hydration — undo-window is sowieso voorbij
        card.undoToken = undefined;
        card.undoExpiresAt = undefined;
      }
    }
  }
  return out;
}
