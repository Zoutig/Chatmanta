'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Image from 'next/image';
import type {
  ChatHistoryTurn,
  ChatResponse,
  DocSummary,
  PipelinePhase,
  StreamEvent,
} from '@/lib/v0/server/rag';
import { fromWire, type AppErrorCode } from '@/lib/errors/app-error';
import type { ThreadSummary } from '@/lib/v0/server/threads';
import type { AllTimeUsage } from '@/lib/v0/server/log';
import type { ExampleQuestion } from '@/lib/v0/server/empty-state-examples';
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
import { useStyleMode } from '@/lib/v0/hooks/use-style-mode';
import { MantaSidebar } from './manta/manta-sidebar';
import { MantaTopbar } from './manta/manta-topbar';
import { MantaComposer } from './manta/manta-composer';
import { MantaRightPanel } from './manta/manta-right-panel';
import { MantaAurora } from './manta/manta-aurora';
import { TypingLoader } from './ui/loader';
import { ThreadIdFooter } from './thread-id-footer';

// Gestructureerde error-state op een Turn: bij voorkeur een AppErrorCode (UI
// mapt naar vriendelijke tekst), met optioneel een correlation-ID. `message`
// dekt UI-eigen fouten die geen API-code hebben ('Geen antwoord opgeslagen').
type TurnError = {
  code?: AppErrorCode;
  message?: string;
  requestId?: string;
  retryAfterSec?: number;
};

type Turn = {
  user: string;
  response: ChatResponse | null;
  streamingText: string | null;
  livePhase: PipelinePhase | null;
  error: TurnError | null;
  replacementReason: string | null;
};

export type BotFlags = {
  cacheEnabled: boolean;
  selfReflect: boolean;
  cascadeOnLowConfidence: boolean;
  cascadeModel: string;
  generalKnowledgeEnabled: boolean;
};

export type OrgOption = { slug: string; name: string };

// Render-cap: alleen de laatste N turns staan in de DOM. Voorkomt rerender-storm
// op lange threads tijdens streaming-deltas. Oudere turns blijven in state én
// in de DB en verschuiven mee als nieuwe turns worden toegevoegd.
const RENDER_TAIL = 50;

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
  examples,
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
  examples: ExampleQuestion[];
}) {
  const [threshold, setThreshold] = useState(defaultThreshold);
  const [rewriteOn, setRewriteOn] = useState(defaultEnableRewrite);
  const [generalKnowledgeOn, setGeneralKnowledgeOn] = useState(botFlags.generalKnowledgeEnabled);
  const { tone, length, setTone, setLength } = useStyle();
  const { hydeMode, setHydeMode } = useHydeMode();
  const { mode: styleMode } = useStyleMode();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>('sources');
  const [rightOpen, setRightOpen] = useState(true);
  // Mobile-drawer state (<= 880px). Op desktop blijft de gewone shell-layout
  // staan; data-attrs hieronder triggeren alleen de drawer-CSS uit globals.css.
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  // Manta-mode: collapse-states voor zowel linker sidebar als rechter rail.
  // Worden alleen gebruikt als styleMode === 'manta'; in classic/glass blijven
  // de bestaande width-tokens leidend.
  const [mantaLeftCollapsed, setMantaLeftCollapsed] = useState(false);
  const [mantaRightCollapsed, setMantaRightCollapsed] = useState(false);
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

  // Wanneer de gebruiker terugschakelt van Manta naar Klassiek/Glass, reset
  // de Manta-collapse-states. Anders blijft de eerstvolgende keer dat ze weer
  // naar Manta switchen het sidebar/rail-panel ingeklapt staan zonder duidelijke
  // reden, en kan de classic-render een korte mismatch tonen omdat het CSS-grid
  // de extra .manta-*-collapsed className zou behouden.
  /* eslint-disable react-hooks/set-state-in-effect -- synchroniseren van mode-specifieke UI-state met de globale styleMode-keuze; geen externe bron mogelijk zonder de hook-API te verbreden. */
  useEffect(() => {
    if (styleMode !== 'manta') {
      setMantaLeftCollapsed(false);
      setMantaRightCollapsed(false);
    }
  }, [styleMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

      // Bewust GEEN startTransition rond de stream-loop: React 19 markeert
      // updates binnen een transition als non-urgent en coalesceert dichte
      // streams van setState-calls (zoals de answer-delta storm) tot één
      // commit. flushSync per delta is dan niet sterk genoeg om door de
      // transition-batching heen te breken — alleen door geen transition te
      // openen krijgt elke delta een eigen render-frame.
      void (async () => {
        try {
          const res = await fetch('/api/v0/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: trimmed,
              threshold,
              enableRewrite: rewriteOn,
              enableGeneralKnowledge: generalKnowledgeOn,
              version: botVersion,
              history,
              tone,
              length,
              hydeMode,
            }),
          });
          if (!res.ok || !res.body) {
            // Parse de error-body als JSON; valt terug op INTERNAL als de
            // server niet-2xx return zonder onze standaard shape.
            const text = await res.text().catch(() => '');
            let parsed: unknown = null;
            try {
              parsed = text ? JSON.parse(text) : null;
            } catch {
              parsed = null;
            }
            const wire = fromWire(parsed);
            throw Object.assign(new Error(`HTTP ${res.status}`), { __wire: wire });
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
                    generalKnowledgeActual: null,
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
                // Per delta een synchrone commit forceren. Zonder flushSync
                // batcht React 19 meerdere setStates die binnen één
                // reader.read()-iteratie binnenkomen tot één commit, waardoor
                // de tussenliggende tokens nooit op het scherm verschijnen.
                flushSync(() => {
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
                // Stream-error met code + requestId — gooi met meta zodat de
                // catch hieronder de gestructureerde shape kan tonen.
                throw Object.assign(new Error(event.code), {
                  __wire: {
                    code: event.code,
                    retryAfterSec: event.retryAfterSec,
                    // requestId wordt door route.ts toegevoegd vóór enqueue.
                    requestId: (event as { requestId?: string }).requestId,
                  },
                });
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
          // Twee bronnen: HTTP-non-2xx pad en NDJSON `error`-event. Beide gooien
          // een Error met `__wire` (code + requestId + retryAfterSec). Onbekend
          // → val terug op INTERNAL.
          const wire =
            err && typeof err === 'object' && '__wire' in err
              ? ((err as { __wire: unknown }).__wire as TurnError)
              : { code: 'INTERNAL' as const };
          updateLastTurn({
            error: wire,
            livePhase: null,
            streamingText: null,
          });
        }
      })();
    },
    [botVersion, persistTurn, rewriteOn, generalKnowledgeOn, threshold, tone, length, hydeMode, updateLastTurn],
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
            error: { message: 'Geen antwoord opgeslagen voor deze vraag.' },
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
        error: { message: 'Geen antwoord opgeslagen voor deze vraag.' },
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

  // Retry na error: andere precondities dan onRegenerate (response is null bij
  // error). Pop de laatste turn en stel dezelfde vraag opnieuw.
  const onRetry = useCallback(() => {
    const last = turnsRef.current[turnsRef.current.length - 1];
    if (!last) return;
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

  const conversationBlock = (
    <>
      {turns.length === 0 ? (
        <EmptyState
          onPick={ask}
          docCount={docs.length}
          chunkCount={totalChunks}
          seed={examplesSeed}
          examples={examples}
        />
      ) : (
        <div className="conversation-inner">
          {(() => {
            const visibleTurns = turns.slice(-RENDER_TAIL);
            const baseIndex = turns.length - visibleTurns.length;
            return visibleTurns.map((t, i) => {
              const absoluteIndex = baseIndex + i;
              const isLast = absoluteIndex === turns.length - 1;
              return (
                <div
                  key={`turn-${absoluteIndex}`}
                  style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
                >
                  <UserMessage content={t.user} />
                  {t.error ? (
                    <ErrorMessage
                      code={t.error.code}
                      message={t.error.message}
                      requestId={t.error.requestId}
                      retryAfterSec={t.error.retryAfterSec}
                      onRetry={isLast && !pending ? onRetry : undefined}
                    />
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
            });
          })()}
        </div>
      )}
    </>
  );

  if (styleMode === 'manta') {
    const appClass = [
      'app',
      mantaLeftCollapsed ? 'manta-left-collapsed' : '',
      mantaRightCollapsed ? 'manta-right-collapsed' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div
        className={appClass}
        data-mobile-shell="true"
        data-drawer-left={leftDrawerOpen ? 'true' : 'false'}
        data-drawer-right={rightDrawerOpen ? 'true' : 'false'}
      >
        <MantaSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={onSelectThread}
          onDeleteThread={onDeleteThread}
          usage={allTimeUsage}
          onNewChat={onNewChat}
          activeOrgSlug={activeOrgSlug}
          availableOrgs={availableOrgs}
          collapsed={mantaLeftCollapsed}
          onToggleCollapsed={() => setMantaLeftCollapsed((v) => !v)}
        />

        <main className="manta-main">
          <MantaTopbar
            title={title}
            turnCount={turns.length}
            botVersion={botVersion}
            bots={bots}
            leftCollapsed={mantaLeftCollapsed}
            onToggleLeft={() => setMantaLeftCollapsed((v) => !v)}
            onOpenLeftDrawer={() => setLeftDrawerOpen(true)}
          />

          <MantaAurora />

          <div className="manta-content">
            <div className="manta-conversation conversation" ref={convoRef}>
              {conversationBlock}
            </div>

            <ThreadIdFooter threadId={activeThreadId} />

            <MantaComposer
              onSend={ask}
              pending={pending}
              threshold={threshold}
              onThresholdChange={setThreshold}
              tone={tone}
              onToneChange={setTone}
              length={length}
              onLengthChange={setLength}
            />
          </div>
        </main>

        <MantaRightPanel
          tab={rightTab}
          onTabChange={setRightTab}
          collapsed={mantaRightCollapsed}
          onToggleCollapsed={() => setMantaRightCollapsed((v) => !v)}
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
          generalKnowledgeOn={generalKnowledgeOn}
          onToggleGeneralKnowledge={() => setGeneralKnowledgeOn((v) => !v)}
          botVersion={botVersion}
          botSystemPrompt={botSystemPrompt}
          bots={bots}
          botFlags={botFlags}
          activeCite={activeCite}
          onCiteClick={onCiteClick}
          docs={docs}
          activeOrgId={activeOrgId}
        />

        {leftDrawerOpen || rightDrawerOpen ? (
          <button
            type="button"
            aria-label="Sluit menu"
            className="drawer-backdrop"
            onClick={() => {
              setLeftDrawerOpen(false);
              setRightDrawerOpen(false);
            }}
          />
        ) : null}
      </div>
    );
  }

  const anyDrawerOpen = leftDrawerOpen || rightDrawerOpen;

  return (
    <div
      className="app"
      data-mobile-shell="true"
      data-drawer-left={leftDrawerOpen ? 'true' : 'false'}
      data-drawer-right={rightDrawerOpen ? 'true' : 'false'}
    >
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
          onOpenLeftDrawer={() => setLeftDrawerOpen(true)}
          onOpenRightDrawer={() => {
            setRightOpen(true);
            setRightDrawerOpen(true);
          }}
        />

        <div className="conversation" ref={convoRef}>
          {conversationBlock}
        </div>

        <ThreadIdFooter threadId={activeThreadId} />

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
          generalKnowledgeOn={generalKnowledgeOn}
          onToggleGeneralKnowledge={() => setGeneralKnowledgeOn((v) => !v)}
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

      {/* Backdrop voor mobile drawer (alleen zichtbaar via CSS bij open-state). */}
      {anyDrawerOpen ? (
        <button
          type="button"
          aria-label="Sluit menu"
          className="drawer-backdrop"
          onClick={() => {
            setLeftDrawerOpen(false);
            setRightDrawerOpen(false);
          }}
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
      {/* Typing-dots als primaire feedback dat de bot werkt; pipeline-phase
          klein eronder zodat we tijdens RAG-tuning nog zien waar 'ie is. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          paddingLeft: 2,
          marginTop: 4,
        }}
      >
        <TypingLoader size="lg" />
        {phase ? <PhaseLineFromPlaceholder phase={phase} /> : null}
      </div>
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
    <span
      style={{
        fontSize: 11.5,
        color: 'var(--fg-dim)',
        letterSpacing: '0.01em',
      }}
    >
      {labels[phase]}…
    </span>
  );
}

