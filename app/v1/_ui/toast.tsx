'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';

// Bevestigingen (niveau B, spec §6): korte toast rechtsonder (mobiel onderin
// over de volle breedte). Fouten blijven langer staan dan successen.

type ToastTone = 'success' | 'error';
type ToastItem = { id: number; tone: ToastTone; message: string };

type ToastApi = { success: (message: string) => void; error: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { id, tone, message }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="v1-toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="v1-toast" data-tone={t.tone === 'error' ? 'error' : undefined}>
            <span className="v1-toast-icon" aria-hidden="true">
              {t.tone === 'error' ? <X size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Buiten de provider (bv. in een test) een stille no-op. */
const NOOP: ToastApi = { success: () => {}, error: () => {} };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}
