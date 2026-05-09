'use client';

import { useTheme } from '@/lib/v0/hooks/use-theme';
import { Icon } from './svg-icons';

/**
 * Single icon-button: cycle light → dark.
 *
 * Tipje: useTheme draagt nog 'system' als waarde voor first-load detection,
 * maar we exposen alleen de twee expliciete waardes. Klik → toggelt naar het
 * tegenovergestelde van de currently resolved mode.
 */
export function ThemeSwitch() {
  const { resolved, set } = useTheme();
  const isDark = resolved === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Schakel naar light mode' : 'Schakel naar dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      onClick={() => set(isDark ? 'light' : 'dark')}
      className="icon-btn"
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={15} />
    </button>
  );
}
