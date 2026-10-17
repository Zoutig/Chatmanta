'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { terugdraaienAction, wisActiesAction } from '../actions';

/** Nieuwste actie van een lead terugdraaien, ook als het al langer dan 15 minuten geleden is (test). */
export function TerugKnop({ id }: { id: string }) {
  const [bezig, setBezig] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function terug() {
    setBezig(true);
    const r = await terugdraaienAction(id);
    setBezig(false);
    if (!r.ok) return toast.error(r.error);
    toast.success('Teruggedraaid.');
    router.refresh();
  }
  return <Button size="sm" variant="ghost" loading={bezig} onClick={terug}>Terugdraaien</Button>;
}

/** Alle acties van deze lead wissen: de lead staat daarna weer zoals vóór het (test)bellen. */
export function WisAllesKnop({ leadId }: { leadId: string }) {
  const [bezig, setBezig] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function wis() {
    if (!window.confirm('Alle acties van deze lead terugdraaien? Gebruik dit als het een test was en je niet echt belde.')) return;
    setBezig(true);
    const r = await wisActiesAction(leadId);
    setBezig(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${r.aantal} ${r.aantal === 1 ? 'actie' : 'acties'} teruggedraaid.`);
    router.refresh();
  }
  return <div><Button size="sm" variant="secondary" loading={bezig} onClick={wis}>Was een test: alles terugdraaien</Button></div>;
}
