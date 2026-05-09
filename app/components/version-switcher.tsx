'use client';

import { useRouter } from 'next/navigation';

export type BotMeta = {
  version: string;
  label: string;
  description: string;
};

export function VersionSwitcher({
  current,
  bots,
}: {
  current: string;
  bots: BotMeta[];
}) {
  const router = useRouter();
  const currentBot = bots.find((b) => b.version === current);

  function onChange(version: string) {
    // Navigate to ?v=<version> — page is server-rendered so this fetches a
    // fresh render with the new bot's defaults (and resets the chat state via
    // the `key` prop on ChatBox in app/page.tsx).
    router.push(`/?v=${encodeURIComponent(version)}`);
  }

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Bot
        <select
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {bots.map((b) => (
            <option key={b.version} value={b.version}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      {currentBot ? (
        <p className="max-w-xs text-right text-[10px] text-zinc-500 dark:text-zinc-400 sm:max-w-sm">
          {currentBot.description}
        </p>
      ) : null}
    </div>
  );
}
