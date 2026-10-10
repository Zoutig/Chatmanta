import { SITE_URL } from '@/lib/site/navigation';
import { cx } from '../../ui/cx';

/**
 * Het embed-fragment, in de échte vorm van de V1-widget
 * (app/v1/app/widget/install-step.tsx + public/widget-v1.js):
 *   <script src="<origin>/widget-v1.js" data-org="<slug>" defer></script>
 * De slug "jouw-bedrijf" is illustratief. Azeret Mono via var(--code).
 */
export const SNIPPET_SRC = `${SITE_URL}/widget-v1.js`;
export const SNIPPET_SLUG = 'jouw-bedrijf';
export const SNIPPET_TEXT = `<script src="${SNIPPET_SRC}" data-org="${SNIPPET_SLUG}" defer></script>`;

export function Snippet({
  id,
  className,
  /** Breek na de src af (zoals in de stage van de mockup). */
  broken = false,
  lit = false,
  label = 'Codefragment',
}: {
  id?: string;
  className?: string;
  broken?: boolean;
  lit?: boolean;
  label?: string;
}) {
  return (
    <pre id={id} className={cx('code', lit && 'lit', className)} aria-label={label}>
      <code>
        <span className="t">&lt;script</span> <span className="a">src</span>=
        <span className="s">&quot;{SNIPPET_SRC}&quot;</span>
        {broken ? '\n  ' : ' '}
        <span className="a">data-org</span>=<span className="s">&quot;{SNIPPET_SLUG}&quot;</span>{' '}
        <span className="a">defer</span>
        <span className="t">&gt;&lt;/script&gt;</span>
      </code>
    </pre>
  );
}
