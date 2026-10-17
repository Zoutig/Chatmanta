import type { Activiteit } from '@/lib/leads/types';
import { BEZWAAR_LABEL, NIET_BELLEN_LABEL, STATUS_LABEL, UITKOMST_LABEL, OPVOLG_SITUATIE_LABEL, type Bezwaar, type LeadStatus, type NietBellenReden, type OpvolgSituatie } from '@/lib/leads/types';
import { toonMoment } from '@/lib/leads/werkdagen';
import { TerugKnop, WisAllesKnop } from './terugdraaien';

function omschrijving(a: Activiteit): string {
  const d = a.details as Record<string, unknown>;
  switch (a.soort) {
    case 'belpoging': {
      let t = a.uitkomst ? UITKOMST_LABEL[a.uitkomst] : 'Gebeld';
      if (a.uitkomst === 'niet_opgenomen' && d.voicemail) t += ' (voicemail)';
      if (a.uitkomst === 'terugbellen' && d.op) t += ` → ${toonMoment(String(d.op))}`;
      if (a.uitkomst === 'geen_interesse' && d.bezwaar) t += `: ${BEZWAAR_LABEL[d.bezwaar as Bezwaar] ?? d.bezwaar}`;
      if (a.uitkomst === 'niet_bellen' && d.reden) t += `: ${NIET_BELLEN_LABEL[d.reden as NietBellenReden] ?? d.reden}`;
      if (typeof d.notitie === 'string' && d.notitie) t += ` · ${d.notitie}`;
      return t;
    }
    case 'mail':
      return `Opvolgmail gestuurd (${OPVOLG_SITUATIE_LABEL[d.situatie as OpvolgSituatie]?.titel ?? d.situatie}) aan ${d.aan}`;
    case 'kennismaking':
      return `Kennismaking gepland: ${toonMoment(String(d.op))}`;
    case 'status':
      return `Status: ${STATUS_LABEL[d.van as LeadStatus] ?? d.van} → ${STATUS_LABEL[d.naar as LeadStatus] ?? d.naar}${d.reden ? ` (${d.reden})` : ''}`;
    case 'notitie':
      return `Notitie: ${d.tekst}`;
    case 'import': {
      const delen = [];
      if (d.gebeld) delen.push(`gebeld op ${d.gebeld}`);
      if (d.mail_verstuurd) delen.push(`gemaild op ${d.mail_verstuurd}`);
      if (d.uitkomst) delen.push(`uitkomst: ${d.uitkomst}`);
      return `Uit Niels' tool: ${delen.join(', ') || 'geïmporteerd'}`;
    }
  }
}

export function Tijdlijn({ items }: { items: (Activiteit & { door: string | null })[] }) {
  if (!items.length) return <p className="v1-hint">Nog niets gebeurd met deze lead.</p>;
  const terugbaar = (a: Activiteit) => !a.ongedaan_op && !!a.vorige_staat && a.soort !== 'import';
  const nieuwste = items.find(terugbaar);
  return (
    <>
    {nieuwste ? <WisAllesKnop leadId={nieuwste.lead_id} /> : null}
    <ul className="ld-tijdlijn">
      {items.map((a) => (
        <li key={a.id} data-ongedaan={a.ongedaan_op ? '' : undefined}>
          <time dateTime={a.created_at}>{toonMoment(a.created_at)}</time>
          {a.door ? ` · ${a.door}` : ''}
          <div>{omschrijving(a)}</div>
          {nieuwste?.id === a.id ? <TerugKnop id={a.id} /> : null}
        </li>
      ))}
    </ul>
    </>
  );
}
