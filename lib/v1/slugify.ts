// org-slug helper. Produces a value valid against the organizations.slug CHECK:
//   slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' AND length between 2 and 64.
// i.e. lowercase alphanumeric + interior hyphens, starts/ends alphanumeric, 2..64 chars.
//
// Uniqueness (the -2/-3 suffix on collision) is handled by the caller against the
// DB unique constraint; this is just the pure base-slug derivation.

const MAX = 64;
// Leave room so the caller's "-<n>" collision suffix can't overflow MAX.
const BASE_MAX = 56;

// Combining diacritical marks (U+0300–U+036F), separated out by NFKD above.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(name: string): string {
  let s = name
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alnum runs → single hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .slice(0, BASE_MAX)
    .replace(/-+$/g, ''); // re-trim if slice landed on a hyphen
  if (s.length < 2) s = 'org'; // floor: symbol-only or 1-char names
  return s;
}

/** Append a uniqueness suffix while staying valid (<=64, no trailing hyphen). */
export function withSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  return `${base}-${n}`.slice(0, MAX).replace(/-+$/g, '');
}
