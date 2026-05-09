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
      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Bot-versie
        <select
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className="ml-2 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {bots.map((b) => (
            <option key={b.version} value={b.version}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      {currentBot ? (
        <p className="max-w-xs text-right text-[11px] text-zinc-500 dark:text-zinc-400 sm:max-w-sm">
          {currentBot.description}
        </p>
      ) : null}
    </div>
  );
}
