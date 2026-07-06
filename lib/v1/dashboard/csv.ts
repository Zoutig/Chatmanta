// V1 Klantendashboard — CSV-export helpers (leads + gesprekken).
//
// toCsv: elke cel wordt gequote (dubbele quotes verdubbeld); een cel die begint
// met = + - of @ krijgt een leidende ' — anders voert Excel/Sheets 'm uit als
// formule (CSV-formule-injectie via bezoekers-input in naam/bericht/notities).
//
// fetchPaginated: PostgREST capt een enkele request op ~1000 rijen (db-max-rows,
// zie lib/v1/limits/usage-limits.ts). Dit haalt tot `cap` rijen op in pagina's
// van 1000 zodat een export-cap (bv. 5000) ook echt gehaald wordt i.p.v. stil op
// 1000 af te kappen.

const DANGEROUS_PREFIX = /^[=+\-@]/;

function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (DANGEROUS_PREFIX.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

const PAGE_SIZE = 1000;

export async function fetchPaginated<T>(
  cap: number,
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, cap) - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(`export-fetch faalde: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < to - from + 1) break; // laatste (incomplete) pagina
  }
  return out;
}
