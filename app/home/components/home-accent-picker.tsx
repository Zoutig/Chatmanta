'use client';

import { Popover } from '@ark-ui/react/popover';
import { Portal } from '@ark-ui/react/portal';
import { Settings } from 'lucide-react';
import { ACCENT_OPTIONS, useAccent } from '@/lib/v0/hooks/use-accent';

export function HomeAccentPicker() {
  const { accent, set } = useAccent();

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Accent-kleur kiezen"
        className="fixed bottom-5 left-20 z-20 inline-flex items-center justify-center rounded-xl p-2.5 backdrop-blur-md border border-white/10 hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent transition-colors"
        style={{
          background: 'rgba(2,6,12,0.55)',
          color: 'var(--manta-accent)',
        }}
      >
        <Settings className="h-5 w-5" />
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            className="z-50 rounded-xl border border-white/10 backdrop-blur-md p-3 shadow-xl"
            style={{
              background: 'rgba(2,6,12,0.9)',
              color: '#eaf6fb',
              minWidth: 200,
            }}
          >
            <Popover.Arrow
              className="[--arrow-size:10px]"
              style={{
                ['--arrow-background' as string]: 'rgba(2,6,12,0.9)',
              }}
            >
              <Popover.ArrowTip className="border-t border-l border-white/10" />
            </Popover.Arrow>
            <Popover.Title className="mb-2 text-xs font-medium uppercase tracking-[0.12em] opacity-70">
              Accent-kleur
            </Popover.Title>
            <div
              className="manta-accent-picker"
              role="radiogroup"
              aria-label="Accent-kleur"
            >
              {ACCENT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={accent === o.value}
                  aria-label={o.label}
                  title={o.label}
                  className={`manta-accent-swatch${accent === o.value ? ' active' : ''}`}
                  style={{ background: o.value }}
                  onClick={() => set(o.value)}
                />
              ))}
            </div>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
