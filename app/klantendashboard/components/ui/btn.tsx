import Link from 'next/link';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

// Btn — themeable knop. Server/shared-component: rendert <button> óf een
// next/link <a> wanneer `href` gezet is, zodat hij in zowel server-pages als
// client-islands bruikbaar is. Styling + hover via .klant-ui-btn in klant.css
// (data-variant / data-size) — inline kan geen :hover.

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'inverse';
export type BtnSize = 'sm' | 'md' | 'lg';

type CommonProps = {
  variant?: BtnVariant;
  size?: BtnSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  title?: string;
  ariaLabel?: string;
};

type ButtonProps = CommonProps & {
  href?: undefined;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
};

type LinkProps = CommonProps & {
  href: string;
  target?: string;
  rel?: string;
};

export function Btn(props: ButtonProps | LinkProps) {
  const {
    variant = 'secondary',
    size = 'md',
    leadingIcon,
    trailingIcon,
    children,
    style,
    className,
    title,
    ariaLabel,
  } = props;

  const cls = `klant-ui-btn${className ? ` ${className}` : ''}`;
  const content = (
    <>
      {leadingIcon}
      {children}
      {trailingIcon}
    </>
  );

  if ('href' in props && props.href !== undefined) {
    return (
      <Link
        href={props.href}
        target={props.target}
        rel={props.rel}
        className={cls}
        data-variant={variant}
        data-size={size}
        style={style}
        title={title}
        aria-label={ariaLabel}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      className={cls}
      data-variant={variant}
      data-size={size}
      style={style}
      title={title}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );
}
