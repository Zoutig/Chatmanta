// Opvolgmail na een belletje: port van opvolgmail-maker.html (buiten de repo,
// bron van waarheid voor teksten en ontwerp B). Puur: geen DOM, geen fetch.
// Tabellen + inline styles + knoppen als PNG overleven plakken in Outlook.
// Niet emailLayout() gebruiken: dat is de navy app-mailstijl.

import type { Afzender, OpvolgSituatie } from './types';
import type { Dagdeel } from './werkdagen';

export type OpvolgInvoer = {
  situatie: OpvolgSituatie;
  vorm: 'je' | 'u';
  naam: string;
  bedrijf: string;
  dagdeel: Dagdeel;
  haakje: string;
  termijn: string;
  link: string;
  eigen: string;
  ps: string;
};

export function standaardInvoer(): OpvolgInvoer {
  return {
    situatie: 'info',
    vorm: 'je',
    naam: '',
    bedrijf: '',
    dagdeel: 'vanmiddag',
    haakje: '',
    termijn: 'binnen twee werkdagen',
    link: '',
    eigen: '',
    ps: '',
  };
}

export type Ontbrekend = { veld: 'naam' | 'bedrijf' | 'link'; label: string };
export type Opvolgmail = { onderwerp: string; html: string; tekst: string; ontbreekt: Ontbrekend[] };

const IMG = 'https://www.chatmanta.nl/mail/';
const UTM = 'utm_source=opvolgmail&utm_medium=email';
export const MAIL_URL = {
  demo: `https://www.chatmanta.nl/voorbeeld?${UTM}`,
  kennismaking: `https://www.chatmanta.nl/kennismaking?bron=opvolgmail&${UTM}`,
  site: `https://www.chatmanta.nl/?${UTM}`,
};

const F = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#0c1e2e';
const MUTED = '#4d6074';
const LINE = '#e2e8ef';
const TEAL = '#0f766e';

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function p(html: string, extra = ''): string {
  return `<p style="margin:0 0 14px;${F};font-size:15px;line-height:1.6;color:${INK};${extra}">${html}</p>`;
}

/** Leeg verplicht veld: gemarkeerd in het voorbeeld; kopiëren is dan geblokkeerd. */
function veld(w: string, label: string): string {
  return w
    ? esc(w)
    : `<span style="background:#fef3c7;color:#92400e;padding:0 4px;border-radius:4px">[${label}]</span>`;
}

// Breedte in css-px (het beeld is 3x zo groot). Bron: scripts/mail-assets.mjs.
const KNOP: Record<string, [string, number]> = {
  'demo-hoofd': ['Bekijk de demo', 164],
  demo: ['Bekijk de demo', 149],
  'kennismaking-hoofd': ['Plan een kennismaking', 213],
  kennismaking: ['Plan een kennismaking', 199],
  'testbot-hoofd': ['Probeer de chatbot', 193],
};

function knop(href: string, naam: string): string {
  const [alt, w] = KNOP[naam];
  return `<a href="${esc(href)}" target="_blank" style="text-decoration:none"><img src="${IMG}knop-${naam}.png?v=1" width="${w}" height="46" alt="${esc(alt)}" style="display:block;width:${w}px;height:46px;border:0;${F};font-size:14px;font-weight:600;color:${TEAL}"></a>`;
}

function knoppen(lijst: [string, string][]): string {
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px"><tr>' +
    lijst
      .map(
        (k, i) =>
          `<td style="padding:0 ${i < lijst.length - 1 ? '4px' : '0'} 0 0;vertical-align:top">${knop(k[0], k[1])}</td>`,
      )
      .join('') +
    '</tr></table>'
  );
}

type Teksten = { onderwerp: string; tekst: string[]; knoppen: [string, string][]; kaal?: boolean };

function teksten(v: OpvolgInvoer): Teksten {
  const u = v.vorm === 'u';
  const J = (je: string, uu: string) => (u ? uu : je);
  const bedrijf = veld(v.bedrijf, 'bedrijfsnaam');
  const eigen = v.eigen ? p(esc(v.eigen)) : '';
  const opening = `${J('Leuk dat ik je ', 'Fijn dat ik u ')}${esc(v.dagdeel)} even kon spreken.`;
  const wat =
    (v.haakje
      ? `${J('Je vertelde dat jullie veel vragen krijgen over ', 'U vertelde dat u veel vragen krijgt over ')}<strong>${esc(v.haakje)}</strong>. Met ChatManta komt er een chatbot op ${J('jullie', 'uw')} website die zulke vragen meteen beantwoordt`
      : `Met ChatManta komt er een chatbot op ${J('jullie', 'uw')} website die vragen van klanten meteen beantwoordt`) +
    `, ook 's avonds en in het weekend. Dat scheelt ${J('jullie', 'u')} telefoontjes en mails.`;
  const vertrouwen = `Hij haalt zijn antwoorden uit ${J('jullie', 'uw')} eigen website. Weet hij iets niet, dan zegt hij dat eerlijk en verwijst hij de klant naar ${J('jullie', 'u')}.`;
  const vast = J('Je zit nergens aan vast.', 'U zit nergens aan vast.');

  switch (v.situatie) {
    case 'info':
      return {
        onderwerp: `Ons gesprek van ${v.dagdeel}`,
        tekst: [
          p(`${opening} Zoals beloofd stuur ik ${J('je', 'u')} wat meer informatie.`),
          eigen,
          p(wat),
          p(vertrouwen),
          p(`Het makkelijkste is om het zelf te zien. Ik zet graag een gratis testversie voor ${bedrijf} klaar, getraind op ${J('jullie', 'uw')} eigen website. ${vast}`),
          p(`Zal ik die voor ${J('je', 'u')} maken? Een kort "ja" als antwoord op deze mail is genoeg.`),
          p('Eerst zelf rondkijken kan ook:', `margin:0 0 10px;color:${MUTED}`),
        ],
        knoppen: [
          [MAIL_URL.demo, 'demo-hoofd'],
          [MAIL_URL.kennismaking, 'kennismaking'],
        ],
      };
    case 'test':
      return {
        onderwerp: `Ons gesprek van ${v.dagdeel}`,
        tekst: [
          p(`${opening} Zoals afgesproken zet ik een gratis testversie van ChatManta voor ${bedrijf} klaar.`),
          eigen,
          p(wat),
          p(vertrouwen),
          p(`Ik train hem op ${J('jullie', 'uw')} eigen website en stuur ${J('je', 'u')} de link ${esc(v.termijn || 'binnen twee werkdagen')}. Dan ${J('kun je', 'kunt u')} hem zelf uitproberen met de vragen die ${J('jullie vaak krijgen', 'u vaak krijgt')}. ${vast}`),
          p(`${J('Wil je', 'Wilt u')} alvast zien hoe het werkt?`, `margin:0 0 10px;color:${MUTED}`),
        ],
        knoppen: [[MAIL_URL.demo, 'demo-hoofd']],
      };
    case 'kennis':
      return {
        onderwerp: `Ons gesprek van ${v.dagdeel}`,
        tekst: [
          p(`${opening} ${J('Je gaf aan dat je', 'U gaf aan dat u')} eerst wat meer wilt weten, dus hierbij een korte uitleg.`),
          eigen,
          p(wat),
          p(vertrouwen),
          p(`Zullen we een keer kort bellen of afspreken? Dan kijken we samen naar ${J('jullie', 'uw')} website en laat ik zien hoe het voor ${bedrijf} zou werken.`),
          p(`Plan hieronder een moment, of stuur me gewoon een paar tijden die ${J('jou', 'u')} uitkomen.`, 'margin:0 0 10px'),
        ],
        knoppen: [
          [MAIL_URL.kennismaking, 'kennismaking-hoofd'],
          [MAIL_URL.demo, 'demo'],
        ],
      };
    case 'klaar':
      return {
        onderwerp: `${J('Jullie', 'Uw')} testversie van ChatManta staat klaar`,
        tekst: [
          p(`Zoals beloofd: de testversie van ChatManta voor ${bedrijf} staat klaar. Hij is getraind op ${J('jullie', 'uw')} eigen website.`),
          eigen,
          p(`Probeer hem gerust uit met vragen die klanten ${J('jullie', 'u')} vaak stellen${v.haakje ? `, bijvoorbeeld over <strong>${esc(v.haakje)}</strong>` : ''}. Zo ${J('zie je', 'ziet u')} meteen hoe hij antwoordt.`),
          p(`Klopt er iets niet of mist hij informatie? Laat het me weten, dan pas ik het aan. ${vast}`),
          p('Liever even samen doorlopen? Plan dan een kennismaking.', `margin:0 0 10px;color:${MUTED}`),
        ],
        knoppen: [
          [v.link.startsWith('https://') ? v.link : '#', 'testbot-hoofd'],
          [MAIL_URL.kennismaking, 'kennismaking'],
        ],
      };
    case 'herinnering':
      return {
        onderwerp: `Re: Ons gesprek van ${v.dagdeel}`,
        kaal: true,
        tekst: [
          p(`Ik stuurde ${J('je', 'u')} laatst een mail over een gratis testversie van ChatManta voor ${bedrijf}.`),
          eigen,
          p(`Zal ik die gewoon voor ${J('je', 'u')} klaarzetten? Een kort "ja" is genoeg. Past het nu niet, dan hoor ik dat ook graag.`),
        ],
        knoppen: [],
      };
  }
}

function ontbreekt(v: OpvolgInvoer): Ontbrekend[] {
  const m: Ontbrekend[] = [];
  if (!v.naam.trim()) m.push({ veld: 'naam', label: 'naam' });
  if (!v.bedrijf.trim()) m.push({ veld: 'bedrijf', label: 'bedrijfsnaam' });
  if (v.situatie === 'klaar' && !/^https:\/\/\S+$/.test(v.link.trim()))
    m.push({ veld: 'link', label: 'link naar de testversie (https://…)' });
  return m;
}

/** Platte tekst voor text/plain op het klembord. Werkt op onze eigen, voorspelbare HTML. */
function naarTekst(html: string): string {
  return html
    .replace(/<a href="([^"]*)"[^>]*><img [^>]*alt="([^"]*)"[^>]*><\/a>/g, (_m, href, alt) => `${alt}: ${href}\n`)
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/p>/g, '\n\n')
    .replace(/<\/div>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((r) => r.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function bouwOpvolgmail(invoer: OpvolgInvoer, afz: Afzender): Opvolgmail {
  const v: OpvolgInvoer = {
    ...invoer,
    naam: invoer.naam.trim(),
    bedrijf: invoer.bedrijf.trim(),
    haakje: invoer.haakje.trim(),
    eigen: invoer.eigen.trim(),
    ps: invoer.ps.trim(),
    link: invoer.link.trim(),
    termijn: invoer.termijn.trim(),
  };
  const s = teksten(v);
  const aanhef = `${v.vorm === 'u' ? 'Beste ' : 'Hoi '}${veld(v.naam, 'naam')},`;
  const kop =
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px"><tr>' +
    `<td style="padding-bottom:14px"><a href="${MAIL_URL.site}" target="_blank"><img src="${IMG}logo.png?v=2" width="142" height="24" alt="ChatManta" style="display:block;width:142px;height:24px;border:0"></a></td></tr>` +
    '<tr><td height="3" bgcolor="#2dd4bf" style="height:3px;line-height:3px;font-size:0;background:#2dd4bf">&nbsp;</td></tr></table>';
  const telDigits = afz.telefoon.replace(/[^\d+]/g, '');
  const foto = afz.fotoUrl?.startsWith('https://')
    ? `<td width="70" style="width:70px;padding-top:16px;vertical-align:middle"><img src="${esc(afz.fotoUrl)}" width="56" height="56" alt="${esc(afz.naam)}" style="display:block;width:56px;height:56px;border:0"></td>`
    : '';
  const handtekening =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:22px;border-top:1px solid ${LINE}"><tr>` +
    foto +
    `<td style="padding-top:16px;vertical-align:middle;${F};font-size:14px;line-height:1.5;color:${MUTED}">` +
    `<div style="font-size:15px;font-weight:700;color:${INK}">${esc(afz.naam)}</div>` +
    `<div>${esc(afz.functie)}, ChatManta &nbsp;·&nbsp; <a href="${MAIL_URL.site}" target="_blank" style="color:${TEAL};text-decoration:none">chatmanta.nl</a></div>` +
    `<div><a href="tel:${esc(telDigits)}" style="color:${MUTED};text-decoration:none">${esc(afz.telefoon)}</a>` +
    ` &nbsp;·&nbsp; <a href="mailto:${esc(afz.email)}" style="color:${TEAL};text-decoration:none">${esc(afz.email)}</a></div></td>` +
    '</tr></table>';
  const ps = v.ps ? p(`P.S. ${esc(v.ps.replace(/^p\.?\s*s\.?:?\s*/i, ''))}`, 'margin:16px 0 0') : '';
  const inhoud =
    p(aanhef) +
    s.tekst.join('') +
    (s.knoppen.length ? knoppen(s.knoppen) : '') +
    p(`Groet,<br>${esc(afz.voornaam)}`, 'margin:22px 0 0') +
    ps +
    handtekening;
  const omhulsel = (binnen: string) => `<div style="${F};color:${INK};max-width:560px">${binnen}</div>`;
  const html = omhulsel((s.kaal ? '' : kop) + inhoud);
  return { onderwerp: s.onderwerp, html, tekst: naarTekst(omhulsel(inhoud)), ontbreekt: ontbreekt(v) };
}
