'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { bouwOpvolgmail, standaardInvoer, type OpvolgInvoer } from '@/lib/leads/opvolgmail';
import { dagdeelVoorMail, type Dagdeel } from '@/lib/leads/werkdagen';
import { schoonEmail } from '@/lib/leads/normaliseren';
import { OPVOLG_SITUATIES, OPVOLG_SITUATIE_LABEL, type Afzender, type Lead, type OpvolgSituatie } from '@/lib/leads/types';
import { mailVerstuurdAction } from '../actions';

const DAGDELEN: Dagdeel[] = ['vanochtend', 'vanmiddag', 'vandaag', 'gisteren'];

const TIP_STANDAARD = 'In Outlook: nieuwe mail, klik in het tekstvak, Ctrl+V. Staat je eigen Outlook-handtekening eronder, haal die dan weg: de handtekening zit al in de mail.';
const TIP_HERINNERING = 'Beantwoord je eerdere mail in Outlook en plak deze tekst erboven met Ctrl+V. Dan blijft het gesprek bij elkaar en staat het onderwerp al goed.';

async function kopieerRijk(html: string, tekst: string, el: HTMLElement | null): Promise<void> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tekst], { type: 'text/plain' }),
        }),
      ]);
      return;
    }
  } catch {
    // val terug op selectie + execCommand
  }
  if (!el) throw new Error('Kopiëren lukte niet.');
  const r = document.createRange();
  r.selectNode(el);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
  const ok = document.execCommand('copy');
  sel?.removeAllRanges();
  if (!ok) throw new Error('Kopiëren lukte niet.');
}

const FOCUSBAAR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [contenteditable=""], [tabindex]:not([tabindex="-1"])';

/** Modaal gedrag: Esc sluit, beginfocus op het eerste veld, Tab blijft binnen de pop-up. */
function useModaal(ref: React.RefObject<HTMLDivElement | null>, onSluit: () => void, beginFocus?: React.RefObject<HTMLElement | null>) {
  const sluitRef = useRef(onSluit);
  useEffect(() => {
    sluitRef.current = onSluit;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const terug = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const eerste = beginFocus?.current ?? el.querySelector<HTMLElement>(FOCUSBAAR);
    eerste?.focus();
    function toets(e: KeyboardEvent) {
      if (!el) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        sluitRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSBAAR)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!items.length) return;
      const eerst = items[0];
      const laatst = items[items.length - 1];
      const actief = document.activeElement;
      if (e.shiftKey && (actief === eerst || !el.contains(actief))) {
        e.preventDefault();
        laatst.focus();
      } else if (!e.shiftKey && (actief === laatst || !el.contains(actief))) {
        e.preventDefault();
        eerst.focus();
      }
    }
    document.addEventListener('keydown', toets);
    return () => {
      document.removeEventListener('keydown', toets);
      if (terug?.isConnected) terug.focus();
    };
    // eenmalig bij openen; onSluit via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function MailPopup({
  lead,
  afzender,
  situatie: beginSituatie,
  onKlaar,
}: {
  lead: Lead;
  afzender: Afzender | null;
  situatie: OpvolgSituatie;
  /** verstuurd = true als "Verstuurd? → ja" is geklikt. */
  onKlaar: (verstuurd: boolean) => void;
}) {
  const toast = useToast();
  const [v, setV] = useState<OpvolgInvoer>(() => ({
    ...standaardInvoer(),
    situatie: beginSituatie,
    vorm: lead.aanspreekvorm,
    naam: lead.contactpersoon ?? '',
    bedrijf: lead.bedrijfsnaam,
    haakje: lead.haakje ?? '',
    dagdeel: dagdeelVoorMail(lead.laatste_poging_op ? new Date(lead.laatste_poging_op) : null, new Date()),
  }));
  const [aan, setAan] = useState(lead.email ?? '');
  const [bewerkt, setBewerkt] = useState(false);
  const [smal, setSmal] = useState(false);
  const [fase, setFase] = useState<'maken' | 'verstuurd?'>('maken');
  const [bezig, setBezig] = useState(false);
  const mailRef = useRef<HTMLDivElement>(null);
  const vensterRef = useRef<HTMLDivElement>(null);
  const naamRef = useRef<HTMLInputElement>(null);
  const kopId = `mail-kop-${lead.id}`;
  useModaal(vensterRef, () => onKlaar(false), afzender ? naamRef : undefined);

  const mail = useMemo(() => (afzender ? bouwOpvolgmail(v, afzender) : null), [v, afzender]);

  useEffect(() => {
    if (!bewerkt && mailRef.current && mail) mailRef.current.innerHTML = mail.html;
  }, [mail, bewerkt]);

  if (!afzender) {
    return (
      <div className="ld-mail" role="dialog" aria-modal="true" aria-labelledby={kopId} ref={vensterRef}>
        <div className="ld-mail-venster" style={{ gridTemplateColumns: '1fr', maxWidth: 520 }}>
          <div className="ld-mail-form">
            <h2 id={kopId} style={{ margin: 0 }}>Eerst je afzender invullen</h2>
            <p>Je naam, functie, telefoon en foto komen in de handtekening. Vul ze één keer in bij Instellingen.</p>
            <div className="ld-dialoog-voet">
              <Button variant="secondary" onClick={() => onKlaar(false)}>Sluiten</Button>
              <Link className="v1-btn v1-btn--primary" href="/v1/leads/instellingen" target="_blank">Naar instellingen</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const zet = <K extends keyof OpvolgInvoer>(k: K, w: OpvolgInvoer[K]) => setV((x) => ({ ...x, [k]: w }));
  const mist = new Set(mail?.ontbreekt.map((m) => m.veld));
  const aanSchoon = schoonEmail(aan);
  const aanOk = aanSchoon !== null;
  const kanKopieren = mail !== null && mail.ontbreekt.length === 0;

  async function kopieer() {
    if (!mail || !mailRef.current) return;
    try {
      const html = mailRef.current.innerHTML;
      const tekst = mailRef.current.innerText;
      await kopieerRijk(html, tekst, mailRef.current.firstElementChild as HTMLElement | null);
      toast.success('Mail gekopieerd. Plak hem met Ctrl+V in Outlook.');
      setFase('verstuurd?');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kopiëren lukte niet.');
    }
  }

  function openOutlook() {
    if (!mail) return;
    const href = `mailto:${aanSchoon ?? ''}?subject=${encodeURIComponent(mail.onderwerp)}`;
    window.location.href = href;
  }

  async function bevestig() {
    if (!mail) return;
    if (!aanSchoon) {
      toast.error('Vul eerst een geldig e-mailadres in.');
      return;
    }
    setBezig(true);
    const r = await mailVerstuurdAction(lead.id, { situatie: v.situatie, onderwerp: mail.onderwerp, aan: aanSchoon });
    setBezig(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success('Vastgelegd: opvolgmail gestuurd.');
    onKlaar(true);
  }

  return (
    <div className="ld-mail" role="dialog" aria-modal="true" aria-labelledby={kopId} ref={vensterRef}>
      <div className="ld-mail-venster">
        <form className="ld-mail-form" onSubmit={(e) => e.preventDefault()} autoComplete="off">
          <h2 id={kopId} style={{ margin: 0, fontSize: 18 }}>Opvolgmail · {lead.bedrijfsnaam}</h2>
          <div className="v1-field">
            <span className="v1-label">Welke mail?</span>
            <div className="ld-chips" role="group" aria-label="Situatie">
              {OPVOLG_SITUATIES.map((s) => (
                <button key={s} type="button" className="ld-chip" aria-pressed={v.situatie === s} onClick={() => zet('situatie', s)} title={OPVOLG_SITUATIE_LABEL[s].uitleg}>
                  {OPVOLG_SITUATIE_LABEL[s].titel}
                </button>
              ))}
            </div>
          </div>
          <div className="v1-field">
            <span className="v1-label">Aanspreken met</span>
            <div className="ld-chips" role="group" aria-label="Aanspreekvorm">
              {(['je', 'u'] as const).map((f) => (
                <button key={f} type="button" className="ld-chip" aria-pressed={v.vorm === f} onClick={() => zet('vorm', f)}>{f}</button>
              ))}
            </div>
          </div>
          <label className="v1-field">
            <span className="v1-label">Naam</span>
            <input ref={naamRef} className={`v1-input ${mist.has('naam') ? 'ld-mist' : ''}`} value={v.naam} onChange={(e) => zet('naam', e.target.value)} placeholder="Jan (bij u: meneer Jansen)" />
          </label>
          <label className="v1-field">
            <span className="v1-label">Gesproken</span>
            <select className="v1-input" value={v.dagdeel} onChange={(e) => zet('dagdeel', e.target.value as Dagdeel)}>
              {DAGDELEN.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label className="v1-field">
            <span className="v1-label">Bedrijfsnaam</span>
            <input className={`v1-input ${mist.has('bedrijf') ? 'ld-mist' : ''}`} value={v.bedrijf} onChange={(e) => zet('bedrijf', e.target.value)} />
          </label>
          {v.situatie !== 'herinnering' ? (
            <label className="v1-field">
              <span className="v1-label">Waar krijgen ze veel vragen over?</span>
              <input className="v1-input" value={v.haakje} onChange={(e) => zet('haakje', e.target.value)} placeholder="planning en beschikbaarheid" />
              <span className="v1-hint">In hun woorden, uit het gesprek. Leeg laten mag.</span>
            </label>
          ) : null}
          {v.situatie === 'test' ? (
            <label className="v1-field">
              <span className="v1-label">Wanneer staat de testversie klaar?</span>
              <input className="v1-input" value={v.termijn} onChange={(e) => zet('termijn', e.target.value)} />
            </label>
          ) : null}
          {v.situatie === 'klaar' ? (
            <label className="v1-field">
              <span className="v1-label">Link naar hun testversie</span>
              <input className={`v1-input ${mist.has('link') ? 'ld-mist' : ''}`} value={v.link} onChange={(e) => zet('link', e.target.value)} placeholder="https://…" />
            </label>
          ) : null}
          <label className="v1-field">
            <span className="v1-label">Eigen zin (optioneel)</span>
            <input className="v1-input" value={v.eigen} onChange={(e) => zet('eigen', e.target.value)} placeholder="Succes met de verbouwing van de showroom." />
          </label>
          <label className="v1-field">
            <span className="v1-label">P.S. (optioneel)</span>
            <input className="v1-input" value={v.ps} onChange={(e) => zet('ps', e.target.value)} placeholder="Mooie projectfoto's op jullie site trouwens." />
          </label>
          <label className="v1-field">
            <span className="v1-label">E-mailadres ontvanger</span>
            <input className={`v1-input ${aan && !aanOk ? 'ld-fout' : ''}`} list={`mails-${lead.id}`} value={aan} onChange={(e) => setAan(e.target.value)} placeholder="jan@bedrijf.nl" />
            <datalist id={`mails-${lead.id}`}>
              {lead.emails_gevonden.map((m) => <option key={m} value={m} />)}
            </datalist>
            {aan && !aanOk ? <span className="v1-hint" style={{ color: 'var(--v1-danger)' }}>Dit adres klopt niet.</span> : null}
          </label>
        </form>

        <div className="ld-mail-rechts">
          <div className="ld-mail-balk">
            <div><span className="v1-hint">Onderwerp</span><div><b>{mail?.onderwerp}</b></div></div>
            {bewerkt ? (
              <p className="ld-melding">
                <span>Je hebt de mail zelf aangepast. Velden links worden niet meer verwerkt.</span>
                <Button size="sm" variant="secondary" onClick={() => setBewerkt(false)}>Opnieuw opbouwen</Button>
              </p>
            ) : null}
            {fase === 'maken' ? (
              <>
                <Button block disabled={!kanKopieren} onClick={kopieer}>
                  {kanKopieren ? 'Kopieer mail' : `Vul eerst in: ${mail?.ontbreekt.map((m) => m.label).join(', ')}`}
                </Button>
                <p className="v1-hint">{v.situatie === 'herinnering' ? TIP_HERINNERING : TIP_STANDAARD}</p>
              </>
            ) : (
              <>
                <Button block variant="secondary" disabled={!aanOk} onClick={openOutlook}>Open Outlook ({aanSchoon ?? 'geen adres'})</Button>
                <p className="v1-hint">Plak in Outlook met Ctrl+V en verstuur. Daarna:</p>
                <div className="ld-dialoog-voet" style={{ justifyContent: 'flex-start' }}>
                  <Button loading={bezig} onClick={bevestig}>Verstuurd</Button>
                  <Button variant="secondary" onClick={() => setFase('maken')}>Nog niet, terug</Button>
                </div>
              </>
            )}
            <div className="ld-chips">
              <button type="button" className="ld-chip" aria-pressed={!smal} onClick={() => setSmal(false)}>Computer</button>
              <button type="button" className="ld-chip" aria-pressed={smal} onClick={() => setSmal(true)}>Telefoon</button>
              <Button size="sm" variant="ghost" onClick={() => onKlaar(false)} style={{ marginLeft: 'auto' }}>Sluiten zonder mail</Button>
            </div>
          </div>
          <div className="ld-mail-voorbeeld" data-smal={smal ? '' : undefined}>
            <div ref={mailRef} contentEditable suppressContentEditableWarning spellCheck aria-label="Voorbeeld van de mail (bewerkbaar)" onInput={() => setBewerkt(true)} />
          </div>
        </div>
      </div>
    </div>
  );
}
