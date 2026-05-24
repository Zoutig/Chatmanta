import Link from 'next/link';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

// IconBtn — vierkante icoon-knop (topbar-acties, rij-acties). Server/shared.
// Rendert <button> óf next/link <a> bij `href`. Hover via .klant-ui-iconbtn.

type CommonProps = {
  size?: number;
  children: ReactNode;
  style?: CSSProperties;
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

export function IconBtn(props: ButtonProps | LinkProps) {
  const { size = 32, children, style, title, ariaLabel } = props;
  const sizeStyle: CSSProperties = { width: size, height: size, ...style };

  if ('href' in props && props.href !== undefined) {
    return (
      <Link
        href={props.href}
        target={props.target}
        rel={props.rel}
        className="klant-ui-iconbtn"
        style={sizeStyle}
        title={title}
        aria-label={ariaLabel}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      className="klant-ui-iconbtn"
      style={sizeStyle}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
