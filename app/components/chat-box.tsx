'use client';

import { useState, useTransition } from 'react';
import { askQuestion } from '../actions/chat';
import type { ChatResponse } from '@/lib/v0/server/rag';

export function ChatBox({
  defaultThreshold,
  defaultEnableRewrite,
}: {
  defaultThreshold: number;
  defaultEnableRewrite: boolean;
}) {
  const [question, setQuestion] = useState('');
  const [threshold, setThreshold] = useState(defaultThreshold);
  const [enableRewrite, setEnableRewrite] = useState(defaultEnableRewrite);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await askQuestion({ question: q, threshold, enableRewrite });
        setResponse(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Onbekende fout');
        setResponse(null);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <section className="flex flex-col gap-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Vraag
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Stel een vraag over de geüploade documenten…"
              rows={3}
              maxLength={1000}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
              Vraag eerst herschrijven door LLM
              <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                (typfouten + synoniemen, +1 LLM-call ≈ $0.0001)
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={pending || question.trim().length === 0}
            className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? 'Bezig…' : 'Vraag stellen'}
          </button>
        </form>

        {error ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {response ? <AnswerPanel response={response} /> : null}
      </section>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <SourcesPanel response={response} />
      </aside>
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
    <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
      <span className="flex items-baseline justify-between">
        Similarity threshold
        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {value.toFixed(2)} (lager = lossere match, hoger = strikter)
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
    </label>
  );
}

function AnswerPanel({ response }: { response: ChatResponse }) {
  const isFallback = response.kind === 'fallback';
  return (
    <div
      className={`rounded-lg border p-4 ${
        isFallback
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
          : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
      }`}
    >
      {response.rewrite && response.rewrite.rewritten !== response.rewrite.original ? (
        <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          <span className="font-medium">Herschreven voor zoekopdracht:</span>{' '}
          <span className="italic">{response.rewrite.rewritten}</span>
        </div>
      ) : null}
      <p className="whitespace-pre-wrap text-sm text-zinc-900 dark:text-zinc-50">
        {response.answer}
      </p>
      <Stats response={response} />
    </div>
  );
}

function Stats({ response }: { response: ChatResponse }) {
  const items: string[] = [];
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
  return (
    <p className="mt-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
      {items.join(' · ')}
    </p>
  );
}

function SourcesPanel({ response }: { response: ChatResponse | null }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Bronnen
      </h2>
      {!response ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Stel een vraag om opgehaalde chunks te zien.
        </p>
      ) : response.sources.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Geen chunks opgehaald.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {response.sources.map((s, i) => (
            <li
              key={i}
              className={`rounded border p-2 text-xs ${
                s.similarity >= response.threshold
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                  : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950'
              }`}
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
          ))}
        </ul>
      )}
    </div>
  );
}
