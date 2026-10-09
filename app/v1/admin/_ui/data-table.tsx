import type { ReactNode } from 'react';

// Tabel voor het admindashboard: één stijl, horizontaal scrollen binnen de
// kaart op smalle schermen. Server component; geef alleen de te tonen velden
// door (geen ruwe query-rijen naar client-componenten).

export type Column = {
  label: ReactNode;
  /** Rechts uitlijnen (bedragen, aantallen). */
  num?: boolean;
  /** Vaste of minimale breedte, bv. '1%' voor een smalle actiekolom. */
  width?: string;
};

export function DataTable({
  columns,
  children,
  label,
}: {
  columns: Column[];
  /** <tr>-rijen. */
  children: ReactNode;
  /** Toegankelijke naam van de tabel. */
  label?: string;
}) {
  return (
    <div className="v1-adm-table-wrap">
      <table className="v1-adm-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col" data-num={c.num || undefined} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Cel met rechts uitgelijnd getal. */
export function NumCell({ children }: { children: ReactNode }) {
  return <td data-num>{children}</td>;
}
