'use client';

import { useEffect, useState } from 'react';
import { Check, Moon, Sun, X } from 'lucide-react';
import { useTheme } from '@/lib/v0/hooks/use-theme';
import { useTweaks } from './use-tweaks';
import { KLANT_ACCENTS, KLANT_DENSITIES } from './accents';

// De topbar-trigger dispatcht dit event; het panel luistert en toggelt open.
// Zo blijven topbar (client-island) en panel (in layout gemount) ontkoppeld
// zonder gedeelde Context.
export const TWEAKS_TOGGLE_EVENT = 'chatmanta:toggle-klant-tweaks';

export function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const { resolved, set: setTheme } = useTheme();
  const { accent, density, setAccent, setDensity } = useTweaks();

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener(TWEAKS_TOGGLE_EVENT, onToggle);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(TWEAKS_TOGGLE_EVENT, onToggle);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!open) return null;

  return (
    <>
      {/* Klik-buiten sluit. */}
      <button
        type="button"
        aria-label="Sluit weergave-opties"
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1200,
          border: 'none',
          background: 'transparent',
          cursor: 'default',
        }}
      />
      <aside
        role="dialog"
        aria-label="Weergave-opties"
        style={{
          position: 'fixed',
          right: 'max(16px, env(safe-area-inset-right))',
          bottom: 'max(16px, env(safe-area-inset-bottom))',
          zIndex: 1201,
          width: 272,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--klant-surface)',
          border: '1px solid var(--klant-border-strong)',
          borderRadius: 'var(--klant-r-lg)',
          boxShadow: '0 18px 50px -12px rgba(0,0,0,0.35)',
          color: 'var(--klant-ink)',
          fontFamily: 'var(--klant-font-body)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderBottom: '1px solid var(--klant-border)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--klant-font-display)',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            Weergave
          </span>
          <button
            type="button"
            aria-label="Sluiten"
            onClick={() => setOpen(false)}
            style={{
              width: 26,
              height: 26,
              borderRadius: 'var(--klant-r-sm)',
              border: '1px solid var(--klant-border)',
              background: 'transparent',
              color: 'var(--klant-muted)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </header>

        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Modus */}
          <Group label="Modus">
            <Segmented
              value={resolved}
              options={[
                { id: 'light', label: 'Licht', icon: <Sun size={13} strokeWidth={1.8} /> },
                { id: 'dark', label: 'Donker', icon: <Moon size={13} strokeWidth={1.8} /> },
              ]}
              onChange={(v) => setTheme(v as 'light' | 'dark')}
            />
          </Group>

          {/* Accent */}
          <Group label="Accent">
            <div style={{ display: 'flex', gap: 8 }}>
              {KLANT_ACCENTS.map((a) => {
                const swatch = resolved === 'dark' ? a.dark : a.light;
                const active = accent === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    title={a.name}
                    aria-label={a.name}
                    aria-pressed={active}
                    onClick={() => setAccent(a.id)}
                    style={{
                      flex: 1,
                      height: 34,
                      borderRadius: 'var(--klant-r-md)',
                      background: swatch,
                      border: active
                        ? '2px solid var(--klant-ink)'
                        : '1px solid var(--klant-border)',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {active && (
                      <Check
                        size={15}
                        strokeWidth={2.6}
                        style={{ color: resolved === 'dark' ? '#06281f' : '#ffffff' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </Group>

          {/* Dichtheid */}
          <Group label="Dichtheid">
            <Segmented
              value={density}
              options={KLANT_DENSITIES.map((d) => ({ id: d.id, label: d.label }))}
              onChange={(v) => setDensity(v as (typeof KLANT_DENSITIES)[number]['id'])}
            />
          </Group>
        </div>
      </aside>
    </>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--klant-dim)',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; label: string; icon?: React.ReactNode }[];
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      style={{
        display: 'flex',
        gap: 3,
        padding: 3,
        borderRadius: 'var(--klant-r-md)',
        background: 'var(--klant-surface-muted)',
        border: '1px solid var(--klant-border)',
      }}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 8px',
              borderRadius: 'var(--klant-r-sm)',
              border: 'none',
              background: active ? 'var(--klant-surface)' : 'transparent',
              boxShadow: active ? 'var(--klant-shadow)' : 'none',
              color: active ? 'var(--klant-ink)' : 'var(--klant-muted)',
              fontFamily: 'var(--klant-font-body)',
              fontSize: 12.5,
              fontWeight: active ? 500 : 400,
              cursor: 'pointer',
            }}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
