// Persoonlijke opvolgmail na een (koud) belletje, in de ChatManta-huisstijl.
// Maakt van een klein JSON-bestand een voorbeeldpagina met een "Kopieer mail"-knop;
// die plak je in Outlook (nieuw/web) met Ctrl+V, opmaak en knoppen gaan mee.
//
//   npm run mail:opvolg -- <pad/naar/mail.json>
//
// Het JSON-bestand en afzender.json (naam, functie, telefoon, e-mail) staan BUITEN
// de repo: de repo is publiek, prospectgegevens en telefoonnummers horen er niet in.
// afzender.json wordt gezocht naast het mailbestand.
//
// mail.json:
//   { "aan": "jan@bedrijf.nl", "onderwerp": "…", "aanhef": "Hoi Jan,",
//     "alineas": ["…", "Tekst met **vet**"], "knoppen": ["demo", "kennismaking"],
//     "afsluiting": "Groet," }
// knoppen: "demo" | "kennismaking" | "site" | { "label": "…", "url": "https://…" }

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { emailButtonRow, emailCard, emailParagraph, esc } from '@/lib/notifications/email-layout';

type Knop = 'demo' | 'kennismaking' | 'site' | { label: string; url: string };
type Mail = {
  aan?: string;
  onderwerp: string;
  aanhef: string;
  alineas: string[];
  knoppen?: Knop[];
  afsluiting?: string;
};
type Afzender = { naam: string; functie?: string; telefoon?: string; email?: string };

const PRESETS: Record<string, { label: string; href: string }> = {
  demo: { label: 'Bekijk de live demo', href: 'https://www.chatmanta.nl/voorbeeld' },
  kennismaking: { label: 'Plan een kennismaking', href: 'https://www.chatmanta.nl/kennismaking?bron=opvolgmail' },
  site: { label: 'Naar chatmanta.nl', href: 'https://www.chatmanta.nl' },
};

function knop(k: Knop): { label: string; href: string } {
  if (typeof k === 'string') {
    const p = PRESETS[k];
    if (!p) throw new Error(`Onbekende knop "${k}" (kies: ${Object.keys(PRESETS).join(', ')})`);
    return p;
  }
  if (!/^https:\/\//.test(k.url)) throw new Error(`Knop-URL moet met https:// beginnen: ${k.url}`);
  return { label: k.label, href: k.url };
}

/** Vrije tekst → veilige HTML: escapen, **vet** toestaan, enkele enters als <br>. */
function alinea(t: string): string {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function handtekening(a: Afzender): string {
  const C = '#4d6074';
  const regels = [
    `<strong style="color:#0c1e2e">${esc(a.naam)}</strong>`,
    esc([a.functie, 'ChatManta'].filter(Boolean).join(' · ')),
    a.telefoon
      ? `<a href="tel:${esc(a.telefoon.replace(/[^\d+]/g, ''))}" style="color:${C};text-decoration:none">${esc(a.telefoon)}</a>`
      : '',
    a.email ? `<a href="mailto:${esc(a.email)}" style="color:#0f766e;text-decoration:none">${esc(a.email)}</a>` : '',
  ].filter(Boolean);
  return `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e2e8ef;font-size:14px;line-height:1.6;color:${C}">${regels.join('<br>')}</p>`;
}

function pagina(mail: Mail, kaart: string): string {
  const aan = mail.aan
    ? `<div class="rij"><span>Aan</span><code>${esc(mail.aan)}</code><button data-tekst="${esc(mail.aan)}">Kopieer</button></div>`
    : '';
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(mail.onderwerp)}</title>
<style>
  body{margin:0;background:#f6f8fb;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0c1e2e}
  .balk{max-width:560px;margin:24px auto 0;padding:16px 20px;background:#fff;border:1px solid #e2e8ef;border-radius:14px}
  .rij{display:flex;gap:10px;align-items:center;margin:0 0 8px;font-size:14px}
  .rij span{width:80px;color:#4d6074}.rij code{flex:1;font:inherit;font-weight:600;overflow-wrap:anywhere}
  button{font:inherit;font-size:13px;padding:6px 12px;border-radius:8px;border:1px solid #0f766e;background:#fff;color:#0f766e;cursor:pointer}
  #kopieer{width:100%;margin-top:8px;padding:12px;font-size:15px;font-weight:600;background:#0f766e;color:#fff}
  .uitleg{margin:10px 0 0;font-size:13px;line-height:1.5;color:#4d6074}
  .mail{max-width:560px;margin:20px auto 40px;padding:0 0 0}
</style></head>
<body>
<div class="balk">
  ${aan}
  <div class="rij"><span>Onderwerp</span><code>${esc(mail.onderwerp)}</code><button data-tekst="${esc(mail.onderwerp)}">Kopieer</button></div>
  <button id="kopieer">Kopieer mail</button>
  <p class="uitleg">Nieuwe mail in Outlook → klik in het tekstvak → <b>Ctrl+V</b>. Zet je eigen Outlook-handtekening uit voor deze mail; de handtekening zit er al in.</p>
</div>
<div class="mail" id="mail">${kaart}</div>
<script>
  function kopieerTekst(t, knop){
    var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();
    document.execCommand('copy');ta.remove();klaar(knop);
  }
  function klaar(knop){var o=knop.textContent;knop.textContent='Gekopieerd ✓';setTimeout(function(){knop.textContent=o},1600);}
  document.querySelectorAll('[data-tekst]').forEach(function(b){b.onclick=function(){kopieerTekst(b.dataset.tekst,b)}});
  document.getElementById('kopieer').onclick=function(){
    var r=document.createRange();r.selectNode(document.getElementById('mail').firstElementChild);
    var s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy');s.removeAllRanges();
    klaar(this);
  };
</script>
</body></html>`;
}

const pad = process.argv[2];
if (!pad) {
  console.error('Gebruik: npm run mail:opvolg -- <pad/naar/mail.json>');
  process.exit(1);
}
const mail = JSON.parse(readFileSync(pad, 'utf8')) as Mail;
const afzender = JSON.parse(readFileSync(join(dirname(pad), 'afzender.json'), 'utf8')) as Afzender;

const body = [
  emailParagraph(esc(mail.aanhef)),
  ...mail.alineas.map((t) => emailParagraph(alinea(t))),
  mail.knoppen?.length ? emailButtonRow(mail.knoppen.map(knop)) : '',
  emailParagraph(esc(mail.afsluiting ?? 'Groet,')),
  handtekening(afzender),
].join('\n');

const uit = join(dirname(pad), `${basename(pad, '.json')}.html`);
writeFileSync(uit, pagina(mail, emailCard({ body })));
console.log(uit);
