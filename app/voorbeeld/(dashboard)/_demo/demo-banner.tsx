'use client';

import Link from 'next/link';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import { buttonClass } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { DEMO_SITE_PATH, resetDemo } from '@/lib/voorbeeld/demo-store';

// Vaste strook boven elke voorbeeldpagina: wat dit is + de weg naar de voorbeeldwebsite.
export function DemoBanner() {
  const toast = useToast();
  return (
    <div className="vb-banner" role="note">
      <div className="vb-banner-text">
        <strong>Voorbeeld-dashboard</strong>
        <span>
          Zo ziet ChatManta eruit voor een klant, hier een fictief vakantiepark. Pas gerust iets aan: wijzigingen
          bewaren we alleen in jouw browser en de chatbot op de voorbeeldwebsite volgt ze direct.
        </span>
      </div>
      <div className="vb-banner-actions">
        <button
          type="button"
          className={buttonClass({ variant: 'ghost', size: 'sm' })}
          onClick={() => {
            resetDemo();
            toast.success('Voorbeeld teruggezet naar de begintoestand');
          }}
        >
          <RotateCcw size={14} aria-hidden="true" /> Opnieuw beginnen
        </button>
        <Link href={DEMO_SITE_PATH} className={buttonClass({ variant: 'primary', size: 'sm' })}>
          Open de voorbeeldwebsite <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
