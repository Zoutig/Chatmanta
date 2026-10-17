'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/v1/_ui/button';
import type { Afzender, Lead, OpvolgSituatie } from '@/lib/leads/types';
import { MailPopup } from './mail-popup';

/** Knop die de mail-pop-up opent. Zonder `situatie` kiest hij die zelf uit de stand van de lead. */
export function DetailMail({
  lead,
  afzender,
  situatie: vasteSituatie,
  label = 'Mail',
  klein = false,
}: {
  lead: Lead;
  afzender: Afzender | null;
  situatie?: OpvolgSituatie;
  label?: string;
  klein?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const situatie: OpvolgSituatie =
    vasteSituatie ?? (lead.opvolgmail_gestuurd_op ? 'herinnering' : lead.status === 'kans' && lead.kennismaking_op ? 'kennis' : 'info');
  return (
    <>
      <Button size={klein ? 'sm' : undefined} variant={klein ? 'secondary' : undefined} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <MailPopup
          lead={lead}
          afzender={afzender}
          situatie={situatie}
          onKlaar={(verstuurd) => {
            setOpen(false);
            if (verstuurd) router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
