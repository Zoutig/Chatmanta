import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/**
 * Knopvarianten uit mockup-final:
 * - primary: navy gevuld (standaard CTA op licht)
 * - teal:    teal gevuld (CTA op navy: Groei-kaart, slot-CTA)
 * - outline: wit met rand (secundaire pakketknoppen)
 * - light:   wit gevuld op navy (rekenhulp-uitkomst)
 * - link:    "ghost" tekstlink met pijl (Bekijk live demo →)
 */
export type ButtonVariant = 'primary' | 'teal' | 'outline' | 'light' | 'link';
export type ButtonSize = 'md' | 'sm';

function classes(variant: ButtonVariant, size: ButtonSize, block: boolean, className?: string) {
  return cx(
    variant === 'link' ? 'btn-link' : `btn btn-${variant}`,
    variant !== 'link' && size === 'sm' && 'btn-sm',
    block && 'btn-block',
    className,
  );
}

function Inner({ children, arrow }: { children: ReactNode; arrow: boolean }) {
  return (
    <>
      {children}
      {arrow ? (
        <span className="arrow" aria-hidden="true">
          →
        </span>
      ) : null}
    </>
  );
}

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Voegt de geanimeerde `→` toe. */
  arrow?: boolean;
  /** Volle breedte. */
  block?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Link als knop. Interne paden (`/…`) via next/link; mailto:/tel:/extern via <a>.
 */
export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  arrow = false,
  block = false,
  className,
  children,
  ...rest
}: Common & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>) {
  const cls = classes(variant, size, block, className);
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={cls} {...rest}>
        <Inner arrow={arrow}>{children}</Inner>
      </Link>
    );
  }
  return (
    <a href={href} className={cls} {...rest}>
      <Inner arrow={arrow}>{children}</Inner>
    </a>
  );
}

/** Echte <button> met dezelfde varianten (default type="button"). */
export function Button({
  variant = 'primary',
  size = 'md',
  arrow = false,
  block = false,
  className,
  children,
  type = 'button',
  ...rest
}: Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>) {
  return (
    <button type={type} className={classes(variant, size, block, className)} {...rest}>
      <Inner arrow={arrow}>{children}</Inner>
    </button>
  );
}
