'use client';

// Maandkiezer: navigeert naar ?period=YYYY-MM op het huidige basePath.

import { useRouter } from 'next/navigation';

export type MonthOption = { value: string; label: string };

export function MonthSelector({
  current,
  options,
  basePath,
}: {
  current: string;
  options: MonthOption[];
  basePath: string;
}) {
  const router = useRouter();
  return (
    <select
      className="v1-input v1-adm-select"
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
