'use client';

// "Overslaan"-knop voor een setup-checklist-stap (item 2). Markeert een
// afgeleide stap handmatig als gedaan via setSetupStepSkippedAction → router
// .refresh() herrendert het server-component met de nieuwe (voltooide) status.
// Zichtbaarheid (hover/focus) zit in klant.css (.klant-setup-skip), niet inline
// — inline :hover wordt door de Tailwind v4 PostCSS-pipeline soms gedropt.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setSetupStepSkippedAction } from '../actions';

export function SkipStepButton({ stepId }: { stepId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className="klant-setup-skip"
      disabled={pending}
      aria-label="Deze stap overslaan en als gedaan markeren"
      title="Overslaan — markeer als gedaan"
      onClick={() =>
        startTransition(async () => {
          const res = await setSetupStepSkippedAction(stepId, true);
          if (res.ok) router.refresh();
        })
      }
    >
      {pending ? 'Bezig…' : 'Overslaan'}
    </button>
  );
}
