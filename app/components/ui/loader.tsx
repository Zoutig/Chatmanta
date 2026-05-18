'use client';

import { cn } from '@/lib/utils';

/**
 * Typing-loader: 3 bouncende stippen in de accent-kleur. Bron 21st.dev
 * loader.tsx — alleen de typing-variant overgenomen omdat dat de enige is
 * die we momenteel gebruiken (PendingPlaceholder in chat-shell.tsx).
 *
 * Vereist `@keyframes typing` in app/globals.css.
 */
export function TypingLoader({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dotSizes = {
    sm: 'h-1 w-1',
    md: 'h-1.5 w-1.5',
    lg: 'h-2 w-2',
  } as const;

  const containerSizes = {
    sm: 'h-4',
    md: 'h-5',
    lg: 'h-6',
  } as const;

  return (
    <div
      className={cn('flex items-center space-x-1', containerSizes[size], className)}
      aria-label="Aan het nadenken"
      role="status"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            'bg-[var(--primary,currentColor)] rounded-full',
            'animate-[manta-typing_1s_infinite]',
            dotSizes[size],
          )}
          style={{ animationDelay: `${i * 250}ms` }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * ClassicLoader — ronde border-spinner met top-transparant segment.
 * Bron: 21st.dev "ClassicLoader" snippet. De originele snippet gebruikte
 * `border-primary`, maar Tailwind v4 in deze repo mapt geen `--color-primary`
 * (alleen background/foreground in `@theme inline` van globals.css). Daarom
 * lezen we de border-color direct uit `--primary` (zelfde patroon als
 * `TypingLoader` hierboven). In Manta-mode resolved --primary naar
 * --manta-accent via de aliassen in manta.css.
 *
 * className-override staat callers toe om size en border-thickness aan te
 * passen (bv. `h-6 w-6 border-[2.5px]` voor de Manta-verstuur-knop).
 */
export function ClassicLoader({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Bezig"
      className={cn(
        'border-[var(--primary,currentColor)] flex h-10 w-10 animate-spin items-center justify-center rounded-full border-4 border-t-transparent',
        className,
      )}
    />
  );
}
