'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'Kopieer' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="klant-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard geweigerd — stil negeren */
        }
      }}
    >
      {done ? 'Gekopieerd ✓' : label}
    </button>
  );
}
