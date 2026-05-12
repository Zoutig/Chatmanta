'use client';

import { Button } from './button';
import { cn } from '@/lib/utils';

/**
 * Radio-groep met shadcn Button als visuele basis. Vervangt het oude
 * `.threshold-preset` patroon. Actieve optie krijgt `variant="default"`
 * (gevuld met --primary), inactieve `variant="outline"`. Behoudt ARIA
 * role="radiogroup" + role="radio" voor screenreaders.
 */
export function SegmentedRadio<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex gap-1.5 flex-wrap', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            variant={active ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(o.value)}
            className="flex-1 min-w-0"
          >
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}
