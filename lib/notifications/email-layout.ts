// Gedeelde huisstijl voor alle ChatManta-mails: donkere kopbalk met logo, witte
// kaart, footer. Pure string-bouwers zonder IO → los testbaar en ook bruikbaar
// voor de Supabase Auth-templates (scripts/render-email-templates.ts).
//
// Mailclients (Outlook!) negeren <style>-blokken, flexbox en SVG grotendeels, dus
// alles is tabel-layout met inline styles en een PNG-logo op een absolute URL.
// De bouwstenen hieronder leveren vertrouwde HTML; vrije tekst van gebruikers
// gaat ALTIJD eerst door esc() (de callers doen dat al per veld).

/** Altijd het productie-domein: een mail wordt buiten de app geopend, dus een
 *  localhost- of preview-URL uit NEXT_PUBLIC_APP_URL zou een kapot logo geven. */
const LOGO_URL = 'https://www.chatmanta.nl/logo/wordmark.png';
const SITE_URL = 'https://www.chatmanta.nl';

const C = {
  page: '#f6f8fb',
  card: '#ffffff',
  header: '#0c1e2e',
  ink: '#0c1e2e',
  muted: '#4d6074',
  faint: '#5f7083',
  line: '#e2e8ef',
  soft: '#f3f6f9',
  button: '#0f766e', // teal-ink: 5,5:1 met wit (AA), #0d9488 haalt dat niet
  link: '#0f766e',
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;font-weight:700;color:${C.ink}">${esc(text)}</h1>`;
}

/** `html` is vertrouwde markup; escape vrije tekst vóór je 'm hier in zet. */
export function emailParagraph(html: string, opts: { muted?: boolean } = {}): string {
  const color = opts.muted ? C.muted : C.ink;
  const size = opts.muted ? '14px' : '15px';
  return `<p style="margin:0 0 16px;font-size:${size};line-height:1.6;color:${color}">${html}</p>`;
}

export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
  <tr><td bgcolor="${C.button}" style="border-radius:10px">
    <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px">${esc(label)}</a>
  </td></tr>
</table>`;
}

/** Label/waarde-tabel (bv. de velden van een aanvraag). Beide kanten worden ge-escaped. */
export function emailDetails(rows: [string, string][]): string {
  const trs = rows
    .map(
      ([k, v], i) =>
        `<tr><td width="130" style="width:130px;padding:9px 16px 9px 0;font-size:14px;color:${C.muted};vertical-align:top;white-space:nowrap;${i ? `border-top:1px solid ${C.line};` : ''}">${esc(k)}</td><td style="padding:9px 0;font-size:14px;color:${C.ink};vertical-align:top;word-break:break-word;${i ? `border-top:1px solid ${C.line};` : ''}">${esc(v)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border-collapse:collapse">${trs}</table>`;
}

/** Grijs tekstblok met kopje, voor vrije tekst (bericht, beschrijving). Tekst wordt ge-escaped. */
export function emailQuote(label: string, text: string): string {
  return `<div style="margin:0 0 6px;font-size:13px;font-weight:600;color:${C.muted};text-transform:uppercase;letter-spacing:.04em">${esc(label)}</div>
<div style="margin:0 0 20px;padding:14px 16px;background:${C.soft};border-radius:10px;font-size:14px;line-height:1.6;color:${C.ink};white-space:pre-wrap;word-break:break-word">${esc(text)}</div>`;
}

export function emailSignoff(lines: string[]): string {
  return emailParagraph(lines.map(esc).join('<br>'));
}

/**
 * Volledig HTML-document rond `body`.
 * - `preheader`: de grijze voorvertoningsregel naast het onderwerp in de inbox.
 * - `footerNote`: waarom de ontvanger deze mail krijgt (AVG-transparantie).
 */
export function emailLayout(opts: { title: string; body: string; preheader?: string; footerNote?: string }): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(opts.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>`
    : '';
  const note = opts.footerNote
    ? `<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${C.faint}">${esc(opts.footerNote)}</p>`
    : '';
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};-webkit-text-size-adjust:100%">
${preheader}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.page}" style="background:${C.page}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px">
      <tr><td bgcolor="${C.header}" style="background:${C.header};border-radius:14px 14px 0 0;padding:22px 32px">
        <a href="${SITE_URL}" target="_blank" style="text-decoration:none"><img src="${LOGO_URL}" width="150" height="30" alt="ChatManta" style="display:block;border:0;outline:none;width:150px;height:30px;color:#ffffff;font-family:${FONT};font-size:20px;font-weight:700"></a>
      </td></tr>
      <tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-top:0;border-radius:0 0 14px 14px;padding:32px;font-family:${FONT};color:${C.ink}">
        ${opts.body}
      </td></tr>
      <tr><td style="padding:20px 32px 0;font-family:${FONT};text-align:center">
        ${note}
        <p style="margin:0;font-size:12px;line-height:1.6;color:${C.faint}">ChatManta · Website-chatbots voor het MKB · <a href="${SITE_URL}" target="_blank" style="color:${C.faint};text-decoration:underline">chatmanta.nl</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
