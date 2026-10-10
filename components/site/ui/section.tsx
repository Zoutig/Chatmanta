import type { ReactNode } from 'react';
import { cx } from './cx';

export type SectionVariant = 'default' | 'tint' | 'dark' | 'plain';

const VARIANT_CLASS: Record<SectionVariant, string | null> = {
  default: 'sec', // licht, standaard sectie-padding
  tint: 'sec sec-tint', // licht-blauwgrijs verloop (Hoe het werkt)
  dark: 'sec sec-dark', // navy nacht-sectie (Liever eerlijk)
  plain: null, // geen ritme-padding: sectie regelt zelf (hero, trust, slot-CTA)
};

/**
 * Sectie-wrapper. `id` = anker (zie SECTION_IDS); scroll-margin-top zit in site.css
 * (`section[id]`), zodat ankers nooit onder de sticky nav vallen.
 * Geef `labelledBy` (id van je h2) óf `ariaLabel` mee voor een benoemde landmark.
 */
export function Section({
  id,
  variant = 'default',
  className,
  labelledBy,
  ariaLabel,
  contained = true,
  containerClassName,
  style,
  children,
}: {
  id?: string;
  variant?: SectionVariant;
  className?: string;
  labelledBy?: string;
  ariaLabel?: string;
  /** Wrap children in `.wrap` (max-breedte + gutter). Default true. */
  contained?: boolean;
  containerClassName?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cx(VARIANT_CLASS[variant], className)}
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
      style={style}
    >
      {contained ? <Container className={containerClassName}>{children}</Container> : children}
    </section>
  );
}

/** Max-breedte-container met responsive gutter (`.wrap`). */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('wrap', className)}>{children}</div>;
}

/**
 * Standaard sectiekop: eyebrow-label + h2 + optionele lede.
 * Eyebrow wordt via CSS in hoofdletters gezet — schrijf hem gewoon ("Hoe het werkt").
 */
export function SectionHead({
  eyebrow,
  title,
  titleId,
  lede,
  center = false,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  titleId: string;
  lede?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('sec-head', center && 'center', className)}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2 id={titleId}>{title}</h2>
      {lede ? <p className="lede">{lede}</p> : null}
    </div>
  );
}
