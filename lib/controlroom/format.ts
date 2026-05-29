// Control Room — kleine, pure formatters voor de UI (NL).

export function formatRelativeNL(iso: string | null): string {
  if (!iso) return 'geen activiteit';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ${d === 1 ? 'dag' : 'dagen'} geleden`;
  if (d < 30) {
    const w = Math.floor(d / 7);
    return `${w} ${w === 1 ? 'week' : 'weken'} geleden`;
  }
  const mo = Math.floor(d / 30);
  return `${mo} ${mo === 1 ? 'maand' : 'maanden'} geleden`;
}

export function formatDateNL(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Geschatte kosten in USD (query_log.cost_usd). Kleine bedragen → 3 decimalen. */
export function formatCostUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}
