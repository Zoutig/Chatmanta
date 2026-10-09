'use client';

// "Samenvatting maken" / "Opnieuw maken" voor de maandrecap (overzicht en detail).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/v1/_ui/button';
import { generateRecapAction } from '@/app/v1/admin/maandelijkse-recap/actions';

export function GenerateRecapButton({
  orgId,
  year,
  month,
  hasRecap,
}: {
  orgId: string;
  year: number;
  month: number;
  hasRecap: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    if (
      hasRecap &&
      !window.confirm(
        'De bestaande AI-samenvatting wordt opnieuw gemaakt en overschreven. Je notities blijven bewaard. Doorgaan?',
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await generateRecapAction(orgId, year, month);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <span className="v1-adm-inline">
      <Button variant={hasRecap ? 'ghost' : 'secondary'} size="sm" onClick={onClick} loading={pending}>
        {hasRecap ? 'Opnieuw maken' : 'Samenvatting maken'}
      </Button>
      {error ? (
        <span role="alert" className="v1-adm-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
