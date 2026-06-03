'use client';

// "Recap genereren" / "Opnieuw genereren" — triggert generateRecapAction.
// useTransition-disabled tegen dubbel-submits; bij regenereren een confirm
// (overschrijft de samenvatting, notities blijven behouden).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generateRecapAction } from '@/app/actions/recap';

export function GenerateRecapButton({
  slug,
  year,
  month,
  hasRecap,
}: {
  slug: string;
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
        'De bestaande AI-samenvatting wordt opnieuw gegenereerd en overschreven. Je notities blijven behouden. Doorgaan?',
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await generateRecapAction(slug, year, month);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        className="klant-btn"
        data-variant={hasRecap ? 'ghost' : 'primary'}
        onClick={onClick}
        disabled={pending}
      >
        {pending ? 'Bezig…' : hasRecap ? 'Opnieuw genereren' : 'Recap genereren'}
      </button>
      {error ? <span style={{ color: 'var(--klant-danger)', fontSize: 12 }}>{error}</span> : null}
    </span>
  );
}
