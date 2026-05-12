import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combine Tailwind classes safely: clsx for conditional joins, twMerge to
 * dedupe conflicting Tailwind utilities (e.g. `px-2 px-4` → `px-4`).
 *
 * Standaard shadcn-helper, gebruikt door alle UI-componenten onder
 * `app/components/ui/`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
