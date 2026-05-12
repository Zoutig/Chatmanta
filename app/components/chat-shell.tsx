'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import type {
  ChatHistoryTurn,
  ChatResponse,
  DocSummary,
  PipelinePhase,
  StreamEvent,
} from '@/lib/v0/server/rag';
import type { ThreadSummary } from '@/lib/v0/server/threads';
import type { AllTimeUsage } from '@/lib/v0/server/log';
import {
  commitTurnAction,
  deleteThreadAction,
  getThreadAction,
} from '../actions/threads';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { Composer } from './composer';
import { EmptyState } from './empty-state';
import { AssistantMessage, UserMessage, ErrorMessage } from './messages';
import { RightPanel, type RightTab } from './right-panel';
import type { BotMeta } from './bot-dropdown';
import { useStyle } from './use-style';
import { useHydeMode } from './use-hyde-mode';

type Turn = {
  user: string;
  response: ChatResponse | null;
  streamingText: string | null;
  livePhase: PipelinePhase | null;
  error: string | null;
  replacementReason: string | null;
};

export type BotFlags = {
  cacheEnabled: boolean;
  selfReflect: boolean;
  cascadeOnLowConfidence: boolean;
  cascadeModel: string;
};

export type OrgOption = { slug: string; name: string };

export function ChatShell({
  botVersion,
  bots,
  botFlags,
  botSystemPrompt,
  defaultThreshold,
  defaultEnableRewrite,
  docs,
  totalChunks,
  initialThreads,
  initialAllTimeUsage,
  activeOrgSlug,
  activeOrgId,
  availableOrgs,
}: {
  botVersion: string;
  bots: BotMeta[];
  botFlags: BotFlags;
  botSystemPrompt: string;
  defaultThreshold: number;
  defaultEnableRewrite: boolean;
  docs: DocSummary[];
  totalChunks: number;
  initialThreads: ThreadSummary[];
  initialAllTimeUsage: AllTimeUsage;
  activeOrgSlug: string;
  activeOrgId: string;
  availableOrgs: OrgOption[];
}) {
  const [threshold, setThreshold] = useState(defaultThreshold);
  const [rewriteOn, setRewriteOn] = useState(defaultEnableRewrite);
  const { tone, length, setTone, setLength } = useStyle();
  const { hydeMode, setHydeMode } = useHydeMode();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>('sources');
  const [rightOpen, setRightOpen] = useState(true);
  const [, startTransition] = useTransition();
  const convoRef = useRef<HTMLDivElement>(null);

  // Threads — initiele lijst van server, daarna client-side beheerd via
  // optimistic updates na commitTurn / delete. Geen router.refresh() nodig.
  const [threads, setThreads] = useState<ThreadSummary[]>(initialThreads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  // All-time usage — geinitialiseerd vanuit query_log op server, daarna lokaal
  // bumpen bij elke succesvolle response zodat de footer real-time meeloopt.
  const [allTimeUsage, setAllTimeUsage] = useState<AllTimeUsage>(initialAllTimeUsage);
  // Seed voor de EmptyState voorbeeldvragen — 0 = initial render (deterministisch
  // i.v.m. hydration), elke "Nieuwe vraag"-klik bumpt 'm zodat de gebruiker
  // andere 4 voorbeelden ziet.
  const [examplesSeed, setExamplesSeed] = useState(0);

  // Body locking — chat-route mag niet body-scrollen, alleen interne containers.
  useEffect(() => {
    document.body.classList.add('body-fixed');
    return () => document.body.classList.remove('body-fixed');
  }, []);

  // Auto-scroll: na elke turn-mutatie naar de bodem.
  useEffect(() => {
    const el = convoRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight + 1000, behavior: 'smooth' });
  }, [turns]);

  // turnsRef + activeThreadIdRef houden laatste waardes voor stable callbacks
  // (ask, onRegenerate) zonder ze opnieuw te bouwen bij elke mutatie.
  // Updaten gebeurt in een effect — niet tijdens render — anders breekt
  // react-hooks/refs.
  const turnsRef = useRef(turns);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const updateLastTurn = useCallback((patch: Partial<Turn>) => {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return next;
    });
  }, []);

  // Persisteer een afgerond paar (user + response) naar de DB en update de
  // sidebar-list. Bij een fout: laten we het in-memory; toon geen blocker.
  const persistTurn = useCallback(
    async (userContent: string, response: ChatResponse) => {
      const result = await commitTurnAction({
        threadId: activeThreadIdRef.current,
        userContent,
        response,
        botVersion,
      });
      if (!result.ok) {
        // Persistentie-fout is niet user-facing; alleen log.
        console.warn('commitTurn failed:', result.error);
        return;
      }
      const summary = result.summary;
      setActiveThreadId(summary.id);
      activeThreadIdRef.current = summary.id;
      setThreads((prev) => {
        const without = prev.filter((t) => t.id !== summary.id);
        return [summary, ...without];
      });
    },
    [botVersion],
  );

  const ask = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      // Bouw history vanuit afgeronde turns.
      const history: ChatHistoryTurn[] = [];
      for (const t of turnsRef.current) {
        if (t.response) {
          history.push({ role: 'user', content: t.user });
          history.push({ role: 'assistant', content: t.response.answer });
        }
      }

      setActiveCite(null);
      setTurns((prev) => [
        ...prev,
        { user: trimmed, response: null, streamingText: null, livePhase: null, error: null, replacementReason: null },
      ]);

      startTransition(async () => {
        try {
          const res = await fetch('/api/v0/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: trimmed,
              threshold,
              enableRewrite: rewriteOn,
              version: botVersion,
              history,
              tone,
              length,
              hydeMode,
            }),
          });
          if (!res.ok || !res.body) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} — ${text || 'no body'}`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let final: ChatResponse | null = null;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (!line) continue;
              const event = JSON.parse(line) as StreamEvent;
              if (event.kind === 'status') {
                updateLastTurn({ livePhase: event.phase });
              } else if (event.kind === 'smalltalk' || event.kind === 'fallback') {
                final = event.response;
                updateLastTurn({ response: event.response, livePhase: null, streamingText: null });
              } else if (event.kind === 'answer-start') {
                updateLastTurn({
                  livePhase: null,
                  streamingText: '',
                  response: {
                    botVersion: event.botVersion,
                    tone,
                    length,
                    kind: 'answer',
                    answer: '',
                    rewrite: event.rewrite,
                    sources: event.sources,
                    threshold: event.threshold,
                    embedTokens: 0,
                    chatInputTokens: 0,
                    chatOutputTokens: 0,
                    totalCostUsd: 0,
                  },
                });
              } else if (event.kind === 'answer-delta') {
                setTurns((prev) => {
                  if (prev.length === 0) return prev;
                  const next = prev.slice();
                  const last = next[next.length - 1];
                  next[next.length - 1] = {
                    ...last,
                    streamingText: (last.streamingText ?? '') + event.text,
                  };
                  return next;
                });
              } else if (event.kind === 'answer-done') {
                final = event.response;
                updateLastTurn({ response: event.response, streamingText: null, livePhase: null });
              } else if (event.kind === 'followups-done' && final?.kind === 'answer') {
                // V0.4: followups komen apart binnen na answer-done. Merge in
                // de UI-turn én in `final` zodat persistTurn straks de juiste
                // tokens/cost in usage opneemt.
                const fr: Extract<ChatResponse, { kind: 'answer' }> = final;
                final = {
                  ...fr,
                  chatInputTokens: fr.chatInputTokens + event.inputTokens,
                  chatOutputTokens: fr.chatOutputTokens + event.outputTokens,
                  totalCostUsd: fr.totalCostUsd + event.costUsd,
                  extras: {
                    ...(fr.extras ?? {}),
                    ...(event.followUps.length > 0 ? { followUps: event.followUps } : {}),
                  },
                };
                updateLastTurn({ response: final, livePhase: null });
              } else if (event.kind === 'replacement' && final?.kind === 'answer') {
                // V0.5 claim-regenerate: het regenerate-antwoord vervangt de
                // eerder via answer-done getoonde versie. UI toont banner.
                final = event.response;
                updateLastTurn({
                  response: final,
                  streamingText: null,
                  replacementReason: 'Antwoord aangepast voor extra zekerheid',
                });
              } else if (event.kind === 'metrics-done' && final?.kind === 'answer') {
                // V0.4: finale phaseTimingsMs (inclusief followups_ms). Vervangt
                // de partial die op answer-done meekwam. Daarna is `final`
                // compleet en mag persistTurn draaien.
                const fr: Extract<ChatResponse, { kind: 'answer' }> = final;
                final = {
                  ...fr,
                  extras: {
                    ...(fr.extras ?? {}),
                    phaseTimingsMs: event.phaseTimingsMs,
                  },
                };
                updateLastTurn({ response: final });
              } else if (event.kind === 'error') {
                throw new Error(event.message);
              }
            }
          }
          if (final) {
            setAllTimeUsage((u) => addResponseUsage(u, final));
            // Persistentie naar DB; wacht hier niet op — we zijn al klaar voor
            // de gebruiker. Fout = silent log, niet blocking.
            void persistTurn(trimmed, final);
          }
        } catch (err) {
          updateLastTurn({
            error: err instanceof Error ? err.message : 'Onbekende fout',
            livePhase: null,
            streamingText: null,
          });
        }
      });
    },
    [botVersion, persistTurn, rewriteOn, threshold, tone, length, hydeMode, updateLastTurn],
  );

  const onCiteClick = useCallback((idx: number) => {
    setActiveCite(idx);
    setRightTab('sources');
    setRightOpen(true);
  }, []);

  const onNewChat = useCallback(() => {
    setTurns([]);
    setActiveCite(null);
    setActiveThreadId(null);
    activeThreadIdRef.current = null;
    setExamplesSeed((s) => s + 1);
  }, []);

  const onSelectThread = useCallback(async (id: string) => {
    if (id === activeThreadIdRef.current) return;
    setActiveCite(null);
    const result = await getThreadAction(id);
    if (!result.ok) {
      console.warn('getThread failed:', result.error);
      return;
    }
    const { messages } = result.detail;
    // Map DB-messages naar in-memory Turn[] (paren).
    const loaded: Turn[] = [];
    let pendingUser: string | null = null;
    for (const m of messages) {
      if (m.role === 'user') {
        // Eventuele orphan user (theoretisch, V0 schrijft alleen paren) flushen.
        if (pendingUser !== null) {
          loaded.push({
            user: pendingUser,
            response: null,
            streamingText: null,
            livePhase: null,
            error: 'Geen antwoord opgeslagen voor deze vraag.',
            replacementReason: null,
          });
        }
        pendingUser = m.content;
      } else {
        loaded.push({
          user: pendingUser ?? '(onbekende vraag)',
          response: m.response,
          streamingText: null,
          livePhase: null,
          error: null,
          replacementReason: null,
        });
        pendingUser = null;
      }
    }
    if (pendingUser !== null) {
      loaded.push({
        user: pendingUser,
        response: null,
        streamingText: null,
        livePhase: null,
        error: 'Geen antwoord opgeslagen voor deze vraag.',
        replacementReason: null,
      });
    }
    setTurns(loaded);
    setActiveThreadId(id);
    activeThreadIdRef.current = id;
  }, []);

  const onDeleteThread = useCallback(async (id: string) => {
    const result = await deleteThreadAction(id);
    if (!result.ok) {
      console.warn('deleteThread failed:', result.error);
      return;
    }
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadIdRef.current === id) {
      // Actieve thread verwijderd → reset naar nieuw gesprek.
      setTurns([]);
      setActiveCite(null);
        setActiveThreadId(null);
      activeThreadIdRef.current = null;
    }
  }, []);

  const onRegenerate = useCallback(() => {
    const last = turnsRef.current[turnsRef.current.length - 1];
    if (!last || !last.response) return;
    // Pop laatste turn, vraag opnieuw met dezelfde input.
    setTurns((prev) => prev.slice(0, -1));
    ask(last.user);
  }, [ask]);

  const pending = turns.length > 0 && turns[turns.length - 1].response === null;

  // Latest response = bron voor de Bronnen-tab.
  const latestResponse =
    [...turns].reverse().find((t) => t.response !== null)?.response ?? null;

  // Topbar-titel: actieve thread-titel als die bestaat, anders de eerste vraag.
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;
  const title =
    activeThread?.title ??
    (turns.length === 0
      ? 'Nieuw gesprek'
      : turns[0].user.slice(0, 80) + (turns[0].user.length > 80 ? '…' : ''));

  return (
    <div className="app">
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
        onDeleteThread={onDeleteThread}
        usage={allTimeUsage}
        onNewChat={onNewChat}
        activeOrgSlug={activeOrgSlug}
        availableOrgs={availableOrgs}
      />

      <main className="main">
        <Topbar
          title={title}
          turnCount={turns.length}
          botVersion={botVersion}
          bots={bots}
          rightOpen={rightOpen}
          onToggleRight={() => setRightOpen((v) => !v)}
        />

        <div className="conversation" ref={convoRef}>
          {turns.length === 0 ? (
            <EmptyState
              onPick={ask}
              docCount={docs.length}
              chunkCount={totalChunks}
              seed={examplesSeed}
            />
          ) : (
            <div className="conversation-inner">
              {turns.map((t, i) => {
                const isLast = i === turns.length - 1;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <UserMessage content={t.user} />
                    {t.error ? (
                      <ErrorMessage message={t.error} />
                    ) : t.response ? (
                      <AssistantMessage
                        response={t.response}
                        streamingText={t.streamingText}
                        pending={isLast && pending}
                        livePhase={null}
                        activeCite={isLast ? activeCite : null}
                        onCiteClick={onCiteClick}
                        onFollowUp={ask}
                        onRegenerate={isLast && !pending ? onRegenerate : undefined}
                        replacementReason={t.replacementReason}
                      />
                    ) : (
                      <PendingPlaceholder phase={t.livePhase} botVersion={botVersion} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Composer
          onSend={ask}
          pending={pending}
          threshold={threshold}
          onThresholdChange={setThreshold}
          tone={tone}
          onToneChange={setTone}
          length={length}
          onLengthChange={setLength}
        />
      </main>

      {rightOpen ? (
        <RightPanel
          tab={rightTab}
          onTabChange={setRightTab}
          response={latestResponse}
          threshold={threshold}
          onThreshold={setThreshold}
          tone={tone}
          onToneChange={setTone}
          length={length}
          onLengthChange={setLength}
          hydeMode={hydeMode}
          onHydeModeChange={setHydeMode}
          rewriteOn={rewriteOn}
          onToggleRewrite={() => setRewriteOn((v) => !v)}
          botVersion={botVersion}
          botSystemPrompt={botSystemPrompt}
          bots={bots}
          botFlags={botFlags}
          activeCite={activeCite}
          onCiteClick={onCiteClick}
          docs={docs}
          activeOrgId={activeOrgId}
        />
      ) : null}
    </div>
  );
}

/**
 * Telt token-counts + cost van een afgeronde ChatResponse op bij de huidige
 * usage-totalen. Spiegelt de mapping in lib/v0/server/log.ts → query_log:
 *   - smalltalk: alleen pre-process tokens (geen embed/chat)
 *   - answer:    embed + chat in/out + optionele rewrite (pre)
 *   - fallback:  embed + optionele rewrite (geen chat)
 */
function addResponseUsage(prev: AllTimeUsage, r: ChatResponse): AllTimeUsage {
  let embed = 0;
  let chatIn = 0;
  let chatOut = 0;
  let pre = 0;
  if (r.kind === 'smalltalk') {
    pre = r.preProcessTokens.in + r.preProcessTokens.out;
  } else {
    embed = r.embedTokens;
    if (r.kind === 'answer') {
      chatIn = r.chatInputTokens;
      chatOut = r.chatOutputTokens;
    }
    if (r.rewrite) {
      pre = r.rewrite.inputTokens + r.rewrite.outputTokens;
    }
  }
  return {
    queryCount: prev.queryCount + 1,
    totalCostUsd: prev.totalCostUsd + r.totalCostUsd,
    embedTokens: prev.embedTokens + embed,
    chatInputTokens: prev.chatInputTokens + chatIn,
    chatOutputTokens: prev.chatOutputTokens + chatOut,
    preTokens: prev.preTokens + pre,
    totalTokens: prev.totalTokens + embed + chatIn + chatOut + pre,
  };
}

function PendingPlaceholder({
  phase,
  botVersion,
}: {
  phase: PipelinePhase | null;
  botVersion: string;
}) {
  return (
    <div className="msg-assistant slide-in">
      <div className="msg-head">
        <div className="msg-avatar pulsing" aria-hidden="true">
          <Image src="/logo/mark.png" alt="" width={510} height={270} />
        </div>
        <div className="msg-meta">
          <span>ChatManta</span>
          <span style={{ color: 'var(--fg-faint)' }}>·</span>
          <span>{botVersion}</span>
        </div>
      </div>
      {phase ? <PhaseLineFromPlaceholder phase={phase} /> : null}
    </div>
  );
}

// Lichtgewicht inline copy van PhaseLive om de cycle messages → chat-shell → messages
// te vermijden tijdens het pending-frame waarin er nog geen <answer> is.
function PhaseLineFromPlaceholder({ phase }: { phase: PipelinePhase }) {
  const labels: Record<PipelinePhase, string> = {
    cache: 'Geheugen raadplegen',
    preprocess: 'Vraag begrijpen',
    decompose: 'Vraag opdelen in onderdelen',
    hyde: 'Hypothetisch antwoord schetsen',
    expand: 'Zoekvragen genereren',
    embed: 'Vraag omzetten naar vector',
    retrieve: 'Documenten zoeken',
    rerank: 'Beste fragmenten kiezen',
    answer: 'Antwoord schrijven',
    reflect: 'Antwoord controleren',
    cascade: 'Sterker model raadplegen',
    followups: 'Vervolgvragen bedenken',
    verify: 'Antwoord verifiëren',
  };
  return (
    <div
      className="pipeline-trail"
      style={{
        background: 'var(--accent-soft)',
        borderColor: 'color-mix(in oklab, var(--accent) 25%, transparent)',
        color: 'var(--accent)',
      }}
    >
      <span className="ripple-dot" />
      <span style={{ fontWeight: 500 }}>{labels[phase]}…</span>
    </div>
  );
}

