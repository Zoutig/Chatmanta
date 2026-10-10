// Voorbeeld: wijzigingen op de VASTE contactverzoeken (status/notitie/verwijderd)
// leven alleen in het geheugen van deze pagina-sessie. Verzoeken die de bezoeker
// zelf via de voorbeeldwidget instuurde gaan via de demo-store (localStorage).
import type { V1ContactRequest } from '@/lib/v1/dashboard/contact-requests';

type Override = Partial<Pick<V1ContactRequest, 'status' | 'notes'>> & { deleted?: boolean };

let overrides: Record<string, Override> = {};
const listeners = new Set<() => void>();

export function patchFixtureRequest(id: string, patch: Override): void {
  overrides = { ...overrides, [id]: { ...overrides[id], ...patch } };
  listeners.forEach((l) => l());
}

export function subscribeFixtureOverrides(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getFixtureOverrides(): Record<string, Override> {
  return overrides;
}

const EMPTY: Record<string, Override> = {};
export function getServerFixtureOverrides(): Record<string, Override> {
  return EMPTY;
}

export function applyFixtureOverrides(
  list: V1ContactRequest[],
  map: Record<string, Override>,
): V1ContactRequest[] {
  return list
    .filter((r) => !map[r.id]?.deleted)
    .map((r) => {
      const o = map[r.id];
      if (!o) return r;
      return {
        ...r,
        ...(o.status !== undefined ? { status: o.status } : {}),
        ...(o.notes !== undefined ? { notes: o.notes } : {}),
      };
    });
}
