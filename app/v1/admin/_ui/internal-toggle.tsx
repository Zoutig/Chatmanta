import Link from 'next/link';
import { SHOW_INTERNAL_PARAM } from '@/lib/v1/admin/internal-orgs';

// Schakelaar 'Toon interne orgs' voor de cross-org-overzichten. Server component:
// de stand staat in de URL (?intern=1), zodat een link of herladen hem bewaart.
// `params` = de andere querystring-waarden die mee moeten (bv. ?window=7d).

export function InternalOrgsToggle({
  basePath,
  showInternal,
  hiddenCount,
  params = {},
}: {
  basePath: string;
  showInternal: boolean;
  hiddenCount: number;
  params?: Record<string, string | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  if (!showInternal) qs.set(SHOW_INTERNAL_PARAM, '1');
  const href = qs.size > 0 ? `${basePath}?${qs.toString()}` : basePath;

  const label = showInternal
    ? 'Verberg interne orgs'
    : hiddenCount > 0
      ? `Toon interne orgs (${hiddenCount})`
      : 'Toon interne orgs';

  return (
    <Link
      href={href}
      className="v1-adm-chip"
      aria-current={showInternal ? 'true' : undefined}
      scroll={false}
      title="Eval-, seed-, test- en demo-orgs. Standaard verborgen zodat de cijfers over echte klanten gaan."
    >
      {label}
    </Link>
  );
}
