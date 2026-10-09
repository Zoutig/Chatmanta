'use client';

// Kopieerknop voor het admindashboard (bv. "Kopieer voor Claude Code"), met toast.

import { Copy } from 'lucide-react';
import { Button, type ButtonVariant } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';

export function CopyButton({
  text,
  label = 'Kopiëren',
  variant = 'secondary',
}: {
  text: string;
  label?: string;
  variant?: ButtonVariant;
}) {
  const toast = useToast();
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success('Gekopieerd');
        } catch {
          toast.error('Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.');
        }
      }}
    >
      <Copy size={14} aria-hidden="true" />
      {label}
    </Button>
  );
}
