'use client';

import { useTheme, type ThemeChoice } from '@/lib/v0/hooks/use-theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: string; aria: string }[] = [
  { value: 'system', label: 'System', icon: '◐', aria: 'Volg systeem-voorkeur' },
  { value: 'light', label: 'Light', icon: '☀', aria: 'Light mode' },
  { value: 'dark', label: 'Dark', icon: '☾', aria: 'Dark mode' },
];

export function ThemeSwitch() {
  const { choice, set } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {OPTIONS.map((opt) => {
        const active = choice === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.aria}
            onClick={() => set(opt.value)}
            className={
              active
                ? 'rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900'
                : 'rounded-full px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50'
            }
          >
            <span aria-hidden="true">{opt.icon}</span>
            <span className="ml-1">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
