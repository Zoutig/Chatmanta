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
