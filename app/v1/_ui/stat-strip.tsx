import Link from 'next/link';
import { InfoTip } from './feedback';

// Cijferstrook (spec 7.2): één wit vlak met 2–4 cijfers, optioneel een
// sparkline en een link naar het bijbehorende scherm.

export type Stat = {
  label: string;
  value: string;
  /** Kleine tekst naast het cijfer, bv. "+12%" of "2 nieuw". */
  delta?: string;
  deltaTone?: 'ok' | 'warn' | 'neutral';
  /** Regel onder het cijfer. */
  sub?: string;
  /** Waarden voor een sparkline (oud → nieuw). */
  spark?: number[];
  info?: string;
  href?: string;
};

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 200;
  const h = 28;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 3 - (v / max) * (h - 6)).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  return (
    <svg className="v1-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="var(--v1-accent)" fillOpacity="0.1" />
      <path d={line} fill="none" stroke="var(--v1-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatBody({ s }: { s: Stat }) {
  return (
    <>
      <span className="v1-stat-label">
        {s.label}
        {s.info ? <InfoTip text={s.info} /> : null}
      </span>
      <span className="v1-stat-value">
        <span className="v1-stat-num">{s.value}</span>
        {s.delta ? (
          <span className="v1-stat-delta" data-tone={s.deltaTone ?? 'neutral'}>
            {s.delta}
          </span>
        ) : null}
      </span>
      {s.spark ? <Sparkline values={s.spark} /> : null}
      {s.sub ? <span className="v1-stat-sub">{s.sub}</span> : null}
    </>
  );
}

export function StatStrip({ items, label }: { items: Stat[]; label: string }) {
  return (
    <section className="v1-stats" aria-label={label}>
      {items.map((s) =>
        s.href ? (
          <Link key={s.label} href={s.href} className="v1-stat">
            <StatBody s={s} />
          </Link>
        ) : (
          <div key={s.label} className="v1-stat">
            <StatBody s={s} />
          </div>
        ),
      )}
    </section>
  );
}
