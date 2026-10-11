'use client';

// Maandkiezer voor de recap-pagina's. Navigeert naar ?period=YYYY-MM. De
// opties worden server-side opgebouwd (lopende + 11 vorige maanden) en als props
// doorgegeven, zodat dit component puur de selectie + navigatie doet.

import { useRouter } from 'next/navigation';

export type MonthOption = { value: string; label: string };

export function MonthSelector({
  current,
  options,
  basePath,
}: {
  current: string;
  options: MonthOption[];
  /** Route waar de ?period naartoe navigeert (overzicht of detailpagina). */
  basePath: string;
}) {
  const router = useRouter();
  return (
    <select
      className="klant-select"
      aria-label="Kies maand"
      value={current}
      onChange={(e) => router.push(`${basePath}?period=${e.target.value}`)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
