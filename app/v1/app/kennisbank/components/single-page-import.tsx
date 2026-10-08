'use client';
// Losse pagina importeren: wordt direct opgehaald, zonder volledige crawl.
// Actie ongewijzigd (scrapeSinglePageAction); vormgeving V1.
import { useState, useTransition } from 'react';
import { scrapeSinglePageAction, refreshWebsiteSources } from '../actions';
import { Button } from '@/app/v1/_ui/button';
import { Field } from '@/app/v1/_ui/controls';
import { useToast } from '@/app/v1/_ui/toast';

export function SinglePageImport({
  onAdded,
  onCancel,
}: {
  onAdded: (s: Awaited<ReturnType<typeof refreshWebsiteSources>>) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function add() {
    if (!url.trim() || pending) return;
    setError(null);
    start(async () => {
      const res = await scrapeSinglePageAction(url);
      if (!res.ok) { setError(res.error); return; }
      setUrl('');
      toast.success('Pagina toegevoegd');
      try { onAdded(await refreshWebsiteSources()); } catch {}
    });
  }
  return (
    <form noValidate className="v1-card v1-kb-card-stack" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <Field label="Losse pagina toevoegen" hint="Wordt direct opgehaald, zonder de hele website.">
        {(id) => (
          <div className="v1-kb-form-row">
            <input id={id} type="url" className="v1-input" placeholder="https://jouwsite.nl/nieuwe-pagina"
              value={url} onChange={(e) => setUrl(e.target.value)} disabled={pending} autoFocus />
            <Button type="submit" loading={pending} disabled={!url.trim()}>Toevoegen</Button>
            <Button variant="ghost" onClick={onCancel} disabled={pending}>Annuleren</Button>
          </div>
        )}
      </Field>
      {error && <p className="v1-alert v1-alert--error" role="alert">{error}</p>}
    </form>
  );
}
