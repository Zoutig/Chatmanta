'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import type { Afzender, Lead, OpvolgSituatie } from '@/lib/leads/types';
import { isLaatstePoging, type UitkomstOpties } from '@/lib/leads/volgende-stand';
import { telLink, toonTelefoon } from '@/lib/leads/normaliseren';
import {
  claimLeadAction,
  geefVrijAction,
  ongedaanAction,
  overslaanAction,
  uitkomstAction,
  verlengClaimAction,
  volgendeLeadAction,
  type BelKaart,
} from '../actions';
import { TelQr } from './qr';
import { Belscript } from './belscript';
import { Tijdlijn } from './tijdlijn';
import { LeadLabels } from './labels';
import { LeadVelden, BEL_VELDEN } from './lead-velden';
import { UitkomstDialogen, type DialoogSoort } from './uitkomst-dialogen';
import { MailPopup } from './mail-popup';

type Focus = { niche: string | null; plaats: string | null };
type KnopUitkomst = 'niet_opgenomen' | 'terugbellen' | 'wil_mail' | 'interesse' | 'geen_interesse' | 'niet_bellen';

/** Fout omdat de lead intussen veranderd/weg is of van een ander: niet blijven hangen, volgende lead. */
function isVerouderd(r: { error: string; code: string }): boolean {
  return r.code === 'NOT_FOUND' || /door een ander|een ander is/i.test(r.error);
}

export function Belmodus({
  afzender,
  niches,
  plaatsen,
  beginFocus,
  beginLeadId,
}: {
  afzender: Afzender | null;
  niches: string[];
  plaatsen: string[];
  beginFocus: Focus;
  beginLeadId: string | null;
}) {
  const toast = useToast();
  const [focus, setFocus] = useState<Focus>(beginFocus);
  const [kaart, setKaart] = useState<BelKaart | null>(null);
  const [leeg, setLeeg] = useState(false);
  const [laden, setLaden] = useState(true);
  const [dialoog, setDialoog] = useState<DialoogSoort>(null);
  const [mail, setMail] = useState<{ lead: Lead; situatie: OpvolgSituatie } | null>(null);
  const [ongedaan, setOngedaan] = useState<{ id: string; tekst: string } | null>(null);
  const ongedaanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voicemail, setVoicemail] = useState(false);
  // Voorkomt dubbele acties (dubbel indrukken van een toets of knop terwijl de server nog bezig is).
  const bezig = useRef(false);

  const laadVolgende = useCallback(
    async (f: Focus) => {
      setLaden(true);
      const r = await volgendeLeadAction(f);
      setLaden(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setKaart(r.kaart);
      setLeeg(r.kaart === null);
      setVoicemail(false);
    },
    [toast],
  );

  // start: een specifieke lead (?lead=...) of de volgende uit de wachtrij
  useEffect(() => {
    (async () => {
      if (beginLeadId) {
        const r = await claimLeadAction(beginLeadId);
        if (r.ok && r.kaart) {
          setKaart(r.kaart);
          setLaden(false);
          return;
        }
        toast.error(r.ok ? 'Een ander is deze lead nu aan het bellen.' : r.error);
      }
      await laadVolgende(beginFocus);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // claim verlengen zolang de pagina zichtbaar is
  const leadId = kaart?.lead.id;
  useEffect(() => {
    if (!leadId) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void verlengClaimAction(leadId);
    }, 120_000);
    const weg = () => void geefVrijAction(leadId);
    window.addEventListener('pagehide', weg);
    return () => {
      clearInterval(t);
      window.removeEventListener('pagehide', weg);
    };
  }, [leadId]);

  function toonOngedaan(id: string, tekst: string) {
    if (ongedaanTimer.current) clearTimeout(ongedaanTimer.current);
    setOngedaan({ id, tekst });
    ongedaanTimer.current = setTimeout(() => setOngedaan(null), 10_000);
  }

  async function kies(o: UitkomstOpties) {
    if (!kaart || bezig.current) return;
    bezig.current = true;
    try {
      const vorigeDialoog = dialoog;
      setDialoog(null);
      const opties = o.uitkomst === 'niet_opgenomen' ? { ...o, voicemail } : o;
      const r = await uitkomstAction(kaart.lead.id, opties);
      if (!r.ok) {
        toast.error(r.error);
        if (isVerouderd(r)) {
          setOngedaan(null);
          await laadVolgende(focus);
        } else if (vorigeDialoog) {
          setDialoog(vorigeDialoog); // invoerfout (bv. datum in het verleden): laat de keuze staan
        }
        return;
      }
      toonOngedaan(r.activiteitId, `${kaart.lead.bedrijfsnaam}: opgeslagen`);
      if (r.opentMail) {
        // De claim blijft staan tot de pop-up dicht is (onKlaar hieronder).
        setMail({ lead: r.lead, situatie: r.opentMail });
        return;
      }
      await laadVolgende(focus);
    } finally {
      bezig.current = false;
    }
  }

  function knop(u: KnopUitkomst) {
    if (!kaart || mail || laden || dialoog) return;
    if (u === 'niet_opgenomen') {
      if (isLaatstePoging(kaart.lead)) setDialoog('niet_opgenomen_laatste');
      else void kies({ uitkomst: 'niet_opgenomen' });
    } else if (u === 'wil_mail') void kies({ uitkomst: 'wil_mail' });
    else setDialoog(u);
  }

  async function overslaan() {
    if (!kaart || mail || bezig.current) return;
    bezig.current = true;
    try {
      const r = await overslaanAction(kaart.lead.id);
      if (!r.ok) toast.error(r.error);
      await laadVolgende(focus);
    } finally {
      bezig.current = false;
    }
  }

  async function maakOngedaan() {
    if (!ongedaan || bezig.current) return;
    bezig.current = true;
    try {
      const id = ongedaan.id;
      setOngedaan(null);
      setMail(null);
      if (kaart) await geefVrijAction(kaart.lead.id);
      const r = await ongedaanAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Ongedaan gemaakt.');
      setKaart(r.kaart);
      setLeeg(r.kaart === null);
    } finally {
      bezig.current = false;
    }
  }

  // toetsen 1-6, S, Ctrl+Z
  useEffect(() => {
    function toets(e: KeyboardEvent) {
      // Niet tijdens typen, en niet als een dialoog of de mail-pop-up open is.
      if (dialoog || mail || laden) return;
      const doel = e.target instanceof Element ? e.target : null;
      if (doel?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], dialog[open], [role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (ongedaan) {
          e.preventDefault();
          void maakOngedaan();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const map: Record<string, KnopUitkomst> = {
        '1': 'niet_opgenomen',
        '2': 'terugbellen',
        '3': 'wil_mail',
        '4': 'interesse',
        '5': 'geen_interesse',
        '6': 'niet_bellen',
      };
      if (map[e.key]) {
        e.preventDefault();
        knop(map[e.key]);
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void overslaan();
      }
    }
    window.addEventListener('keydown', toets);
    return () => window.removeEventListener('keydown', toets);
  });

  const focusKiezer = (
    <div className="ld-balk">
      <select className="v1-input" value={focus.niche ?? ''} onChange={(e) => setFocus((f) => ({ ...f, niche: e.target.value || null }))} aria-label="Branche">
        <option value="">Alle branches</option>
        {niches.map((n) => <option key={n}>{n}</option>)}
      </select>
      <select className="v1-input" value={focus.plaats ?? ''} onChange={(e) => setFocus((f) => ({ ...f, plaats: e.target.value || null }))} aria-label="Plaats">
        <option value="">Alle plaatsen</option>
        {plaatsen.map((p) => <option key={p}>{p}</option>)}
      </select>
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          if (bezig.current || mail) return;
          if (kaart) await geefVrijAction(kaart.lead.id);
          await laadVolgende(focus);
        }}
      >
        Focus toepassen
      </Button>
      {kaart ? (
        <span className="ld-teller" style={{ marginLeft: 'auto' }}>
          <span>Vandaag <b>{kaart.teller.gebeld}</b> gebeld</span>
          <span><b>{kaart.teller.opgenomen}</b> opgenomen</span>
          <span><b>{kaart.teller.interesse}</b> interesse</span>
        </span>
      ) : null}
    </div>
  );

  if (laden && !kaart) return <>{focusKiezer}<p className="ld-leeg">Volgende lead ophalen…</p></>;
  if (leeg || !kaart) {
    return (
      <>
        {focusKiezer}
        <div className="ld-kaart ld-leeg">
          <h2>Niets meer te bellen voor deze focus</h2>
          <p>Kijk bij <Link href="/v1/leads?tab=terugbellen">Terugbellen</Link> of <Link href="/v1/leads?tab=opvolgen">Opvolgen</Link>, of kies een andere focus.</p>
        </div>
      </>
    );
  }

  const l = kaart.lead;
  return (
    <>
      {focusKiezer}
      <div className="ld-bel">
        <section className="ld-kaart" aria-label="Bedrijf">
          <div>
            <h1 className="ld-bedrijf">{l.bedrijfsnaam}</h1>
            <span className="ld-sub">{[l.niche, l.plaats].filter(Boolean).join(' · ')}</span>
            <div><LeadLabels lead={l} /></div>
          </div>
          {l.website_url ? (
            <a className="v1-btn v1-btn--secondary v1-btn--sm" href={l.website_url} target="_blank" rel="noopener noreferrer">Website openen ↗</a>
          ) : null}
          <LeadVelden key={l.id} lead={l} velden={BEL_VELDEN} onOpgeslagen={(nieuw) => setKaart((k) => (k ? { ...k, lead: nieuw } : k))} />
          <Belscript />
        </section>

        <section className="ld-kaart" aria-label="Bellen" style={{ textAlign: 'center' }}>
          {l.telefoon ? (
            <>
              <a className="ld-nummer" href={telLink(l.telefoon)}>{toonTelefoon(l.telefoon)}</a>
              <TelQr tel={telLink(l.telefoon)} />
              <p className="ld-qr-tip">Scan met je telefoon om te bellen</p>
            </>
          ) : (
            <p>Geen telefoonnummer. Vul het in op de detailpagina.</p>
          )}
          {l.telefoons_extra.length ? (
            <div className="ld-sub">Ook: {l.telefoons_extra.map((t) => <a key={t} href={telLink(t)} style={{ marginRight: 8 }}>{toonTelefoon(t)}</a>)}</div>
          ) : null}
          {l.email ? <div className="ld-sub">{l.email}</div> : null}
          <div className="ld-sub">Poging {l.pogingen_niet_opgenomen + 1} van 3{l.volgende_actie_notitie ? ` · ${l.volgende_actie_notitie}` : ''}</div>
          <label className="ld-sub" style={{ display: 'inline-flex', gap: 6, justifyContent: 'center' }}>
            <input type="checkbox" checked={voicemail} onChange={(e) => setVoicemail(e.target.checked)} /> Voicemail ingesproken
          </label>
          <div className="ld-knoppen">
            <button type="button" className="ld-uitkomst" onClick={() => knop('niet_opgenomen')}><kbd>1</kbd>Niet opgenomen</button>
            <button type="button" className="ld-uitkomst" onClick={() => knop('terugbellen')}><kbd>2</kbd>Terugbellen</button>
            <button type="button" className="ld-uitkomst" onClick={() => knop('wil_mail')}><kbd>3</kbd>Wil een mail</button>
            <button type="button" className="ld-uitkomst" data-tone="ok" onClick={() => knop('interesse')}><kbd>4</kbd>Interesse</button>
            <button type="button" className="ld-uitkomst" onClick={() => knop('geen_interesse')}><kbd>5</kbd>Geen interesse</button>
            <button type="button" className="ld-uitkomst" data-tone="danger" onClick={() => knop('niet_bellen')}><kbd>6</kbd>Niet bellen</button>
          </div>
          <Button variant="ghost" size="sm" onClick={overslaan}>Overslaan (S)</Button>
        </section>

        <section className="ld-kaart" aria-label="Geschiedenis">
          <h2 style={{ margin: 0, fontSize: 16 }}>Geschiedenis</h2>
          <Tijdlijn items={kaart.tijdlijn} />
          <div>
            <h3 style={{ margin: '8px 0 4px', fontSize: 14 }}>
              Score {l.score ?? '–'}{l.score_max ? `/${l.score_max}` : ''} {l.score_voorlopig ? <span className="ld-label">voorlopig</span> : null}
            </h3>
            <ul className="v1-hint" style={{ margin: 0, paddingLeft: 16 }}>
              {l.score_redenen.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          <Link href={`/v1/leads/${l.id}`} target="_blank">Alle details ↗</Link>
        </section>
      </div>

      <UitkomstDialogen
        key={l.id}
        soort={dialoog}
        bedrijfsnaam={l.bedrijfsnaam}
        telefoonTekst={toonTelefoon(l.telefoon)}
        notitie={l.notitie}
        leadId={l.id}
        onSluit={() => setDialoog(null)}
        onKies={kies}
      />

      {mail ? (
        <MailPopup
          lead={mail.lead}
          afzender={afzender}
          situatie={mail.situatie}
          onKlaar={async () => {
            const id = mail.lead.id;
            setMail(null);
            await geefVrijAction(id);
            await laadVolgende(focus);
          }}
        />
      ) : null}

      {ongedaan ? (
        <div className="ld-ongedaan" role="status">
          <span>{ongedaan.tekst}</span>
          <Button size="sm" variant="secondary" onClick={maakOngedaan}>Ongedaan maken (Ctrl+Z)</Button>
        </div>
      ) : null}
    </>
  );
}
