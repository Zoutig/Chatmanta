'use client';

/**
 * Vercel-Geist stijl Button (button-1) — compacte primary/secondary/tertiary/
 * error/warning + manta variant. Bron: 21st.dev "button-1" snippet,
 * aangepast voor ChatManta:
 * - `clsx` → onze `cn()` zodat className-overrides werken via twMerge.
 * - `htmlType` prop (default "button") ipv hardcoded `type="submit"` — voorkomt
 *   accidental form-submit op niet-form buttons.
 * - Extra `manta` type-variant die `--primary` (= --manta-accent in Manta-scope)
 *   gebruikt, zodat de Verstuur-knop automatisch meekleurt met accent-keuze.
 */

import * as React from 'react';
import { Spinner } from './spinner-1';
import { cn } from '@/lib/utils';

const sizes = [
  {
    tiny: 'px-1.5 h-6 text-sm',
    small: 'px-1.5 h-8 text-sm',
    medium: 'px-2.5 h-10 text-sm',
    large: 'px-3.5 h-12 text-base',
  },
  {
    tiny: 'w-6 h-6 text-sm',
    small: 'w-8 h-8 text-sm',
    medium: 'w-10 h-10 text-sm',
    large: 'w-12 h-12 text-base',
  },
] as const;

const types = {
  primary: 'bg-[var(--ds-gray-1000,#171717)] hover:bg-[var(--ds-gray-1000-h,#383838)] text-[var(--ds-background-100,#fff)] fill-[var(--ds-background-100,#fff)]',
  secondary: 'bg-[var(--ds-background-100,#fff)] hover:bg-[var(--ds-gray-alpha-200,rgba(0,0,0,0.08))] text-[var(--ds-gray-1000,#171717)] fill-[var(--ds-gray-1000,#171717)] border border-[var(--ds-gray-alpha-400,rgba(0,0,0,0.08))]',
  tertiary: 'bg-transparent hover:bg-[var(--ds-gray-alpha-200,rgba(0,0,0,0.08))] text-[var(--ds-gray-1000,#171717)] fill-[var(--ds-gray-1000,#171717)]',
  error: 'bg-[#dc2626] hover:bg-[#b91c1c] text-white fill-white',
  warning: 'bg-[#d97706] hover:bg-[#b45309] text-black fill-black',
  manta: 'bg-[var(--primary)] hover:bg-[color-mix(in_oklab,var(--primary)_90%,black)] text-[var(--primary-foreground)] fill-[var(--primary-foreground)]',
} as const;

const shapes = {
  square: {
    tiny: 'rounded',
    small: 'rounded-md',
    medium: 'rounded-md',
    large: 'rounded-lg',
  },
  circle: {
    tiny: 'rounded-full',
    small: 'rounded-full',
    medium: 'rounded-full',
    large: 'rounded-full',
  },
  rounded: {
    tiny: 'rounded-[100px]',
    small: 'rounded-[100px]',
    medium: 'rounded-[100px]',
    large: 'rounded-[100px]',
  },
} as const;

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'prefix'> {
  size?: keyof (typeof sizes)[0];
  type?: keyof typeof types;
  variant?: 'styled' | 'unstyled';
  shape?: keyof typeof shapes;
  svgOnly?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  shadow?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Native HTML button type (was `type` in upstream snippet — gerenamed om
   *  conflict met onze visual-type prop te voorkomen). Default `"button"`. */
  htmlType?: 'button' | 'submit' | 'reset';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    size = 'medium',
    type = 'primary',
    variant = 'styled',
    shape = 'square',
    svgOnly = false,
    children,
    prefix,
    suffix,
    shadow = false,
    loading = false,
    disabled = false,
    fullWidth = false,
    htmlType = 'button',
    className,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={htmlType}
      disabled={disabled || loading}
      tabIndex={0}
      className={cn(
        'inline-flex justify-center items-center gap-0.5 duration-150 transition-colors',
        sizes[svgOnly ? 1 : 0][size],
        disabled || loading
          ? 'bg-[var(--ds-gray-100,#f2f2f2)] text-[var(--ds-gray-700,#8f8f8f)] border border-[var(--ds-gray-400,#ebebeb)] cursor-not-allowed'
          : types[type],
        shapes[shape][size],
        shadow && 'shadow-sm border-none',
        fullWidth && 'w-full',
        variant === 'unstyled'
          ? 'outline-none px-0 h-fit bg-transparent hover:bg-transparent text-current'
          : 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring,currentColor)]',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'large' ? 24 : 16} color="currentColor" /> : prefix}
      <span
        className={cn(
          'relative overflow-hidden whitespace-nowrap text-ellipsis font-sans',
          size !== 'tiny' && variant !== 'unstyled' && 'px-1.5',
        )}
      >
        {children}
      </span>
      {!loading && suffix}
    </button>
  );
});
