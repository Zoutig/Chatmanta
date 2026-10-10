'use client';

// Gesprek-ID klein onderaan, met kopieerknop: zo kan de klant het meesturen als
// hij een probleem met dit gesprek wil melden.

import { Copy } from 'lucide-react';
import { useToast } from '@/app/v1/_ui/toast';

export function ConversationId({ id }: { id: string }) {
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Gesprek-ID gekopieerd');
    } catch {
      toast.error('Kopiëren lukte niet. Selecteer het ID en kopieer het zelf.');
    }
  }

  return (
    <p className="v1-gs-id">
      <span>Gesprek-ID</span>
      <code>{id}</code>
      <button type="button" className="v1-gs-textbtn" onClick={copy} aria-label="Gesprek-ID kopiëren">
        <Copy size={14} strokeWidth={1.8} aria-hidden="true" />
        Kopieer
      </button>
    </p>
  );
}
