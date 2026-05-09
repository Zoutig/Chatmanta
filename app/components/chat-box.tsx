'use client';

import { useState, useTransition } from 'react';
import type {
  ChatHistoryTurn,
  ChatResponse,
  PipelinePhase,
  StreamEvent,
} from '@/lib/v0/server/rag';

/**
 * Client-side mirror van parseV03Output (server file mag niet vanuit client
 * geïmporteerd worden door 'server-only' marker). Houd in sync.
 */
function parseStreamingV03(raw: string): { thinking: string | null; answer: string } {
  const thinkingMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const answerMatch = raw.match(/<answer>([\s\S]*?)(?:<\/answer>|$)/i);
  let answer = answerMatch?.[1] ?? '';
  if (!answerMatch) {
    if (thinkingMatch) {
      answer = raw.slice(raw.indexOf('</thinking>') + 11);
    } else {
      answer = raw;
    }
  }
  // Strip eventuele <confidence>...</confidence> aan het einde tijdens streaming.
  answer = answer.replace(/<confidence>[\s\S]*$/i, '');
  return {
    thinking: thinkingMatch?.[1]?.trim() ?? null,
    answer: answer.trim(),
  };
}

const PHASE_LABELS: Record<PipelinePhase, string> = {
  cache: 'Geheugen raadplegen…',
  preprocess: 'Vraag begrijpen…',
  decompose: 'Vraag opdelen in onderdelen…',
  hyde: 'Hypothetisch antwoord schetsen…',
  expand: 'Zoekvragen genereren…',
  embed: 'Vraag omzetten naar vector…',
  retrieve: 'Documenten zoeken…',
  rerank: 'Beste fragmenten kiezen…',
  answer: 'Antwoord schrijven…',
  reflect: 'Antwoord controleren…',
  cascade: 'Sterker model raadplegen…',
  followups: 'Vervolgvragen bedenken…',
};

const EXAMPLE_QUESTIONS = [
  'wat doet ChatManta?',
  'voor welke doelgroep is het?',
  'welke stack gebruiken jullie?',
  'wie heeft het gebouwd?',
  'wat zijn de kernprincipes?',
  'hoe werkt RAG bij jullie?',
];

export function ChatBox({
  botVersion,
  defaultThreshold,
  defaultEnableRewrite,
}: {
  botVersion: string;
  defaultThreshold: number;
  defaultEnableRewrite: boolean;
}) {
  const [question, setQuestion] = useState('');
  const [threshold, setThreshold] = useState(defaultThreshold);
  const [enableRewrite, setEnableRewrite] = useState(defaultEnableRewrite);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  // Streaming-only: de tekst die binnenstroomt voor de huidige answer-call.
  const [streamingText, setStreamingText] = useState<string | null>(null);
  // Huidige pipeline-fase tijdens een lopende vraag — null wanneer niets loopt.
  const [phase, setPhase] = useState<PipelinePhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Sessie tellers — leven binnen de huidige browser-sessie + ChatBox mount.
  // Gereset zodra de versie wisselt (key prop op ChatBox in page.tsx) zodat
  // costs per versie apart geteld kunnen worden tijdens vergelijking.
  const [sessionCostUsd, setSessionCostUsd] = useState(0);
  const [sessionQueryCount, setSessionQueryCount] = useState(0);
  // Volledig conversatie-log voor weergave + meesturen aan server (laatste N).
  const [history, setHistory] = useState<ChatHistoryTurn[]>([]);

  function resetConversation() {
    setHistory([]);
    setResponse(null);
    setStreamingText(null);
    setError(null);
  }

  function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setError(null);
    setResponse(null);
    setStreamingText(null);
    setPhase(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/v0/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: trimmed,
            threshold,
            enableRewrite,
            version: botVersion,
            history,
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
              setPhase(event.phase);
            } else if (event.kind === 'smalltalk' || event.kind === 'fallback') {
              final = event.response;
              setResponse(event.response);
              setPhase(null);
            } else if (event.kind === 'answer-start') {
              // Show metadata-only response while waiting for tokens.
              setStreamingText('');
              setResponse({
                botVersion: event.botVersion,
                kind: 'answer',
                answer: '',
                rewrite: event.rewrite,
                sources: event.sources,
                threshold: event.threshold,
                embedTokens: 0,
                chatInputTokens: 0,
                chatOutputTokens: 0,
                totalCostUsd: 0,
              });
            } else if (event.kind === 'answer-delta') {
              setStreamingText((prev) => (prev ?? '') + event.text);
            } else if (event.kind === 'answer-done') {
              final = event.response;
              setResponse(event.response);
              setStreamingText(null);
              setPhase(null);
            } else if (event.kind === 'error') {
              throw new Error(event.message);
            }
          }
        }
        if (final) {
          setSessionCostUsd((c) => c + final!.totalCostUsd);
          setSessionQueryCount((n) => n + 1);
          // Append turn to conversation history so volgende vraag context heeft.
          setHistory((h) => [
            ...h,
            { role: 'user', content: trimmed },
            { role: 'assistant', content: final!.answer },
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Onbekende fout');
        setResponse(null);
        setStreamingText(null);
        setPhase(null);
      }
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    ask(question);
  }

  function onExampleClick(q: string) {
    setQuestion(q);
    ask(q);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <section className="flex flex-col gap-4">
        <SessionStats
          costUsd={sessionCostUsd}
          queryCount={sessionQueryCount}
          version={botVersion}
          turnCount={history.length / 2}
          onReset={resetConversation}
        />
        {history.length > 0 ? <HistoryPanel history={history} /> : null}
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Vraag
            </span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Stel een vraag over de geüploade documenten…"
              rows={3}
              maxLength={1000}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>

          <ThresholdSlider value={threshold} onChange={setThreshold} />

          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={enableRewrite}
              onChange={(e) => setEnableRewrite(e.target.checked)}
              className="h-4 w-4 accent-zinc-900 dark:accent-zinc-50"
            />
            <span>
              Slimme pre-processing
              <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                (smalltalk-detectie + typfouten + synoniemen, +1 LLM-call ≈ $0.0001)
              </span>
            </span>
          </label>

          <ExamplesBar onPick={onExampleClick} disabled={pending} />

          <button
            type="submit"
            disabled={pending || question.trim().length === 0}
            className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? 'Bezig…' : 'Vraag stellen'}
          </button>
        </form>

        {error ? (
          <div className="rounded-md border border-zinc-200 border-l-2 border-l-red-500 bg-white p-3 text-sm text-red-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-red-400">
            <span className="mr-2 text-[10px] uppercase tracking-[0.08em]">Fout</span>
            {error}
          </div>
        ) : null}

        {pending && !response && phase ? (
          <PhaseIndicator phase={phase} />
        ) : null}

        {response ? (
          <AnswerPanel
            response={response}
            streamingText={streamingText}
            pending={pending}
            onAskFollowUp={onExampleClick}
          />
        ) : null}
      </section>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <SourcesPanel response={response} />
      </aside>
    </div>
  );
}

function SessionStats({
  costUsd,
  queryCount,
  version,
  turnCount,
  onReset,
}: {
  costUsd: number;
  queryCount: number;
  version: string;
  turnCount: number;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Sessie
      </span>
      <span className="font-mono text-zinc-700 dark:text-zinc-300">{version}</span>
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <span className="text-zinc-500 dark:text-zinc-400">
        {queryCount} {queryCount === 1 ? 'vraag' : 'vragen'}
      </span>
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <span className="font-mono text-zinc-900 dark:text-zinc-50">
        ${costUsd.toFixed(6)}
      </span>
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <span className="text-zinc-500 dark:text-zinc-400">
        {turnCount} {turnCount === 1 ? 'turn' : 'turns'}
      </span>
      {turnCount > 0 ? (
        <button
          type="button"
          onClick={onReset}
          className="ml-auto rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 hover:border-red-400 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-500 dark:hover:border-red-700 dark:hover:text-red-400"
        >
          Reset gesprek
        </button>
      ) : null}
    </div>
  );
}

function PhaseIndicator({ phase }: { phase: PipelinePhase }) {
  const accentDot =
    phase === 'answer' || phase === 'retrieve'
      ? 'bg-emerald-500 dark:bg-emerald-400'
      : 'bg-zinc-400 dark:bg-zinc-500';
  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 border-l-2 border-l-zinc-400 bg-white p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:border-l-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
      <span className={`inline-block h-2 w-2 animate-pulse rounded-full ${accentDot}`} />
      <span className="font-mono text-xs">{PHASE_LABELS[phase]}</span>
    </div>
  );
}

function HistoryPanel({ history }: { history: ChatHistoryTurn[] }) {
  return (
    <details className="rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Geschiedenis · {history.length / 2} turns
      </summary>
      <ul className="space-y-1.5 px-3 pb-3">
        {history.map((t, i) => (
          <li
            key={i}
            className="rounded border border-zinc-200 border-l-2 border-l-zinc-300 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:border-l-zinc-700 dark:bg-zinc-950"
          >
            <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              {t.role === 'user' ? 'jij' : 'bot'}
            </span>
            <span className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{t.content}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ExamplesBar({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Voorbeeldvragen
      </span>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThresholdSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
      <span className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
          Similarity threshold
        </span>
        <span className="font-mono text-xs text-zinc-900 dark:text-zinc-50">
          {value.toFixed(2)}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-zinc-900 dark:accent-zinc-50"
      />
      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
        lager = lossere match · hoger = strikter
      </span>
    </label>
  );
}

function AnswerPanel({
  response,
  streamingText,
  pending,
  onAskFollowUp,
}: {
  response: ChatResponse;
  streamingText: string | null;
  pending: boolean;
  onAskFollowUp: (q: string) => void;
}) {
  // Border-left accent per response-kind. Subtiele all-around border + bg blijven uniform.
  const accentClass =
    response.kind === 'fallback'
      ? 'border-l-amber-500'
      : response.kind === 'smalltalk'
        ? 'border-l-sky-500'
        : 'border-l-zinc-900 dark:border-l-emerald-500';

  const rewriteToShow =
    response.kind !== 'smalltalk' &&
    response.rewrite &&
    response.rewrite.rewritten !== response.rewrite.original
      ? response.rewrite.rewritten
      : null;

  // V0.3: tijdens streaming kan tekst <thinking>/<answer>/<confidence> bevatten.
  // Parse client-side zodat we alleen het echte antwoord tonen.
  const parsedStreaming = streamingText !== null ? parseStreamingV03(streamingText) : null;
  const displayText = parsedStreaming !== null ? parsedStreaming.answer : response.answer;
  const stillThinking =
    parsedStreaming !== null &&
    parsedStreaming.thinking !== null &&
    parsedStreaming.answer.length === 0;

  const extras = response.kind === 'answer' ? response.extras : undefined;

  return (
    <div
      className={`rounded-lg border border-zinc-200 border-l-2 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${accentClass}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {response.botVersion}
        </span>
        {response.kind === 'fallback' ? (
          <span className="text-[10px] uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">
            Fallback
          </span>
        ) : null}
        {response.kind === 'smalltalk' ? (
          <span className="text-[10px] uppercase tracking-[0.08em] text-sky-700 dark:text-sky-400">
            Smalltalk
          </span>
        ) : null}
        {extras?.fromCache ? (
          <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
            Cache
          </span>
        ) : null}
        {extras?.cascadeUsed ? (
          <span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300">
            Cascade
          </span>
        ) : null}
        {extras?.confidence !== undefined ? <ConfidenceBadge value={extras.confidence} /> : null}
      </div>
      {rewriteToShow ? (
        <div className="mb-3 rounded border border-zinc-200 border-l-2 border-l-blue-500 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <span className="mr-1 text-[10px] uppercase tracking-[0.08em] text-blue-700 dark:text-blue-300">
            Rewritten
          </span>
          <span className="italic">{rewriteToShow}</span>
        </div>
      ) : null}
      {extras?.subQueries && extras.subQueries.length > 1 ? (
        <details className="mb-3 rounded border border-zinc-200 border-l-2 border-l-blue-500 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.08em] text-blue-700 dark:text-blue-300">
            Sub-vragen · {extras.subQueries.length}
          </summary>
          <ul className="mt-1 list-disc pl-4">
            {extras.subQueries.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {stillThinking ? (
        <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
          <span className="mr-1 text-[10px] uppercase tracking-[0.08em]">Denkt</span>
          aan het nadenken…
        </p>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-zinc-900 dark:text-zinc-50">
          <CitedText
            text={displayText}
            sources={response.kind !== 'smalltalk' ? response.sources : []}
          />
          {streamingText !== null && pending ? (
            <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-zinc-400 align-middle dark:bg-zinc-500" />
          ) : null}
        </p>
      )}
      {extras?.followUps && extras.followUps.length > 0 && streamingText === null ? (
        <FollowUpsBar followUps={extras.followUps} onPick={onAskFollowUp} />
      ) : null}
      {streamingText === null ? <Stats response={response} /> : null}
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.8
      ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
      : value >= 0.5
        ? 'border-yellow-200 text-yellow-800 dark:border-yellow-900 dark:text-yellow-300'
        : 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300';
  return (
    <span
      className={`rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] dark:bg-zinc-900 ${tone}`}
    >
      conf {pct}%
    </span>
  );
}

function CitedText({
  text,
  sources,
}: {
  text: string;
  sources: { filename: string | null; similarity: number }[];
}) {
  // Split rond [N] tokens en render ze als kleine sup-badges.
  const parts: React.ReactNode[] = [];
  const re = /\[(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const num = Number.parseInt(m[1], 10);
    const src = sources[num - 1];
    parts.push(
      <sup
        key={`${m.index}`}
        title={src ? `${src.filename ?? '(geen filename)'} · sim ${src.similarity.toFixed(3)}` : `chunk ${num}`}
        className="ml-0.5 inline-block cursor-help rounded bg-zinc-100 px-1 font-mono text-[9px] font-bold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        {num}
      </sup>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function FollowUpsBar({
  followUps,
  onPick,
}: {
  followUps: string[];
  onPick: (q: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Vervolgvragen
      </span>
      <div className="flex flex-wrap gap-1.5">
        {followUps.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stats({ response }: { response: ChatResponse }) {
  const items: string[] = [];
  if (response.kind === 'smalltalk') {
    items.push('direct · geen retrieval');
    items.push(`pre ${response.preProcessTokens.in}→${response.preProcessTokens.out}t`);
    items.push(`$${response.totalCostUsd.toFixed(6)}`);
  } else {
    items.push(`drempel ${response.threshold.toFixed(2)}`);
    if (response.rewrite) {
      items.push(`rewrite ${response.rewrite.inputTokens}→${response.rewrite.outputTokens}t`);
    }
    items.push(`embed ${response.embedTokens}t`);
    if (response.kind === 'answer') {
      items.push(`chat ${response.chatInputTokens}→${response.chatOutputTokens}t`);
    }
    items.push(`$${response.totalCostUsd.toFixed(6)}`);
    if (response.kind === 'fallback') {
      items.push(response.reason);
    }
  }
  return (
    <p className="mt-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
      {items.join(' · ')}
    </p>
  );
}

function SourcesPanel({ response }: { response: ChatResponse | null }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Bronnen
      </h2>
      <SourcesPanelBody response={response} />
    </div>
  );
}

function SourcesPanelBody({ response }: { response: ChatResponse | null }) {
  if (!response) {
    return (
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Stel een vraag om opgehaalde chunks te zien.
      </p>
    );
  }
  if (response.kind === 'smalltalk') {
    return (
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Direct antwoord — geen documenten doorzocht.
      </p>
    );
  }
  if (response.sources.length === 0) {
    return (
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Geen chunks opgehaald.</p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {response.sources.map((s, i) => {
        const hit = s.similarity >= response.threshold;
        const accent = hit
          ? 'border-l-emerald-500'
          : 'border-l-zinc-300 dark:border-l-zinc-700';
        return (
          <li
            key={i}
            className={`rounded border border-zinc-200 border-l-2 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950 ${accent}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                {s.filename ?? '(geen filename)'}
              </span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {s.similarity.toFixed(3)}
              </span>
            </div>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{s.contentExcerpt}</p>
          </li>
        );
      })}
    </ul>
  );
}
