'use client';

// Herlaadknop: router.refresh() haalt verse server-data op zonder volledige
// paginaload (alle admin-pagina's zijn force-dynamic).

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/app/v1/_ui/button';

export function ReloadButton({ label = 'Herladen' }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="secondary" loading={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? null : <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" />}
      {label}
    </Button>
  );
}
