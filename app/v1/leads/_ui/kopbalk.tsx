'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/app/v1/_ui/brand-mark';

const ITEMS = [
  { href: '/v1/leads', label: 'Lijst', exact: true },
  { href: '/v1/leads/bellen', label: 'Bellen' },
  { href: '/v1/leads/inzicht', label: 'Inzicht' },
  { href: '/v1/leads/instellingen', label: 'Instellingen' },
];

export function Kopbalk() {
  const pad = usePathname();
  return (
    <header className="ld-kop">
      <Link href="/v1/leads" className="ld-merk">
        <BrandMark />
        ChatManta <span className="ld-merk-tag">Leads</span>
      </Link>
      <nav className="ld-nav" aria-label="Leads">
        {ITEMS.map((i) => {
          const actief = i.exact ? pad === i.href : pad.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} className="ld-nav-item" aria-current={actief ? 'page' : undefined}>
              {i.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
