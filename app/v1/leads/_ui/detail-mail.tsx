'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/v1/_ui/button';
import type { Afzender, Lead, OpvolgSituatie } from '@/lib/leads/types';
import { MailPopup } from './mail-popup';

export function DetailMail({ lead, afzender }: { lead: Lead; afzender: Afzender | null }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const situatie: OpvolgSituatie = lead.opvolgmail_gestuurd_op ? 'herinnering' : lead.status === 'kans' && lead.kennismaking_op ? 'kennis' : 'info';
  return (
    <>
      <Button onClick={() => setOpen(true)}>Mail</Button>
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
