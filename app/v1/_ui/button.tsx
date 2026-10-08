import type { ButtonHTMLAttributes, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}): string {
  return ['v1-btn', `v1-btn--${variant}`, size === 'sm' && 'v1-btn--sm', block && 'v1-btn--block']
    .filter(Boolean)
    .join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Toont een spinner en blokkeert de knop zolang een actie loopt. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant,
  size,
  block,
  loading = false,
  className,
  disabled,
  type,
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[buttonClass({ variant, size, block }), className].filter(Boolean).join(' ')}
    >
      {loading ? <span className="v1-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
