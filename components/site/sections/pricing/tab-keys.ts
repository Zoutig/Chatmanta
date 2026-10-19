/**
 * Toetsenbordnavigatie voor een tablist (WAI-ARIA APG "Tabs, automatic activation"):
 * pijl links/rechts wisselt (met omloop), Home/End springen naar de eerste/laatste tab.
 * Puur (geen React/DOM) zodat node:test het direct kan laden. Gebruikt door de
 * pakket-tabs (pricing-plans.tsx) en de vergelijkings-tabs (compare-tabs.tsx).
 *
 * @returns de nieuwe index, of null als de toets niets met de tabs doet.
 */
export function tabIndexForKey(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
