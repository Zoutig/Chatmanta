import { cx } from './cx';

/**
 * Het echte ChatManta-merkteken (public/logo/mono-mark.png) als CSS-mask, ingekleurd
 * met currentColor. NOOIT een zelfgetekende glyph. Breedte via CSS (`.mk` = 32px;
 * overschrijf met een eigen klasse of `style={{ width }}`).
 */
export function Mark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={cx('mk', className)} style={style} aria-hidden="true" />;
}

/** Woordmerk: "Chat" in navy (ink), "Manta" in teal. */
export function Wordmark() {
  return (
    <span className="wm">
      Chat<em>Manta</em>
    </span>
  );
}

/**
 * Logo = merkteken + woordmerk. Standaard een link naar de top van de homepage.
 * `onDark` voor navy achtergronden. `href={null}` rendert een <span>.
 */
export function Logo({
  href = '/#top',
  onDark = false,
  className,
  ariaLabel = 'ChatManta, naar boven',
  onClick,
}: {
  href?: string | null;
  onDark?: boolean;
  className?: string;
  ariaLabel?: string;
  onClick?: () => void;
}) {
  const cls = cx('logo', onDark && 'on-dark', className);
  const inner = (
    <>
      <Mark />
      <Wordmark />
    </>
  );
  if (href === null) return <span className={cls}>{inner}</span>;
  return (
    <a className={cls} href={href} aria-label={ariaLabel} onClick={onClick}>
      {inner}
    </a>
  );
}
