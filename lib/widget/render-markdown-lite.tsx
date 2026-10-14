// Mini markdown-renderer voor de widget — opzettelijk smaller dan de full
// renderMarkdown() uit lib/widget/render-markdown.tsx (die rendert h1/h2/h3
// met border-bottom etc., te zwaar voor een chat-bubble).
//
// Ondersteund:
//   - **bold**  → <strong>
//   - lege regel → paragraph-break (witruimte)
//   - regel begint met `- ` of `* ` → bullet-item (samengevouwen tot één <ul>)
//
// Niet ondersteund: # headings, genummerde lijsten, nested bullets, tabellen,
// links. Onbekend = plain text (graceful degradation).
//
// Strip tags die de v0.3+ output-formaat per ongeluk doorlekt: <thinking>,
// <answer>, <confidence>, en [n]-citaties.

import type { ReactNode } from 'react';

// Streaming-veilige cleaner. De widget rendert rauwe LLM-deltas; bots met
// chainOfThought:true streamen eerst <thinking>…</thinking> en pas daarna het
// <answer>. Tijdens de stream kan de buffer dus een GEOPENDE <thinking> zonder
// sluit-tag bevatten — de regex voor gesloten blokken pakt die niet, waardoor
// de rauwe redenering anders zichtbaar wordt in de bubble. Spiegelt
// parseStreamingV03 uit app/components/messages.tsx, maar teruggebracht tot een
// string-cleaner voor de lite-renderer. Exported zodat de widget-component met
// hetzelfde resultaat kan beslissen tussen "typt nog" en "toont antwoord".
export function cleanWidgetAnswer(text: string): string {
  let s = text;
  // Gesloten blokken eruit.
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  s = s.replace(/<confidence>[\s\S]*?<\/confidence>/gi, '');
  // Open <thinking> zonder sluit-tag → model is nog aan het redeneren; alles
  // vanaf de open-tag is interne reasoning en mag niet zichtbaar zijn.
  const openThink = s.search(/<thinking>/i);
  if (openThink !== -1 && !/<\/thinking>/i.test(s.slice(openThink))) {
    s = s.slice(0, openThink);
  }
  // Alles ná </answer> is confidence/metadata — nooit antwoord-tekst. Knip het
  // in één keer weg (spiegelt parseStreamingV03's </answer>-tail-strip), dan de
  // losse <answer>-open tag. De nog-open <confidence>-staart-strip blijft voor
  // bots die zónder </answer> afsluiten.
  s = s.replace(/<\/answer>[\s\S]*$/i, '');
  s = s.replace(/<answer>/gi, '');
  s = s.replace(/<confidence>[\s\S]*$/i, '');
  // [n]-citaties.
  s = s.replace(/\s*\[\d+\](\[\d+\])*/g, '');
  // Halve trailing tag aan het buffer-einde ("<", "<a", "<thi"…) afknippen
  // zodat hij niet als zichtbare tekst flikkert tijdens streaming.
  s = s.replace(/<[a-z/]*$/i, '');
  return s.trim();
}

// `linkify`: zet op false tijdens het streamen. De rauwe deltas zijn dan nog
// niet door de server-sanitizer gehaald, dus een (mogelijk verzonnen) link mag
// nog niet klikbaar worden — hij rendert als kale label-tekst tot het
// answer-done event de geschoonde tekst levert. Voorkomt een klikbare-404-flits.
//
// `options.linkButtons` (opt-in, alleen de V1-widget + preview met Linkknoppen aan):
// een regel of lijst-item dat uit precies één link bestaat, wordt een knop. Alle
// andere aanroepers (V0, /voorbeeld, gesprekken) zien byte-identieke uitvoer.
export function renderMarkdownLite(
  text: string,
  linkColor?: string,
  linkify = true,
  options?: { linkButtons?: boolean },
): ReactNode {
  const buttons = linkify && options?.linkButtons === true;
  const clean = cleanWidgetAnswer(text);

  const lines = clean.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line → paragraph-break (one block of vertical space)
    if (!line.trim()) {
      blocks.push(
        <div key={key++} style={{ height: 8 }} aria-hidden="true" />,
      );
      i++;
      continue;
    }

    // Bullet list — consume consecutive `- ` / `* ` lines
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      // Linkknoppen: een lijst die alleen uit losse links bestaat → knoppen-stapel.
      const lone = buttons ? items.map(loneLink) : [];
      if (buttons && lone.every((l) => l !== null)) {
        blocks.push(
          <div key={key++} className="cmw-linkbtns">
            {lone.map((l, idx) => linkButton(l!, idx))}
          </div>,
        );
        continue;
      }
      blocks.push(
        <ul
          key={key++}
          style={{
            margin: '4px 0',
            paddingLeft: 20,
            listStyleType: 'disc',
          }}
        >
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 2 }}>
              {renderInline(it, linkColor, linkify)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Linkknoppen: een regel die alleen uit één link bestaat → knop.
    const loneLine = buttons ? loneLink(line) : null;
    if (loneLine) {
      blocks.push(
        <div key={key++} className="cmw-linkbtns">
          {linkButton(loneLine, 0)}
        </div>,
      );
      i++;
      continue;
    }

    // Plain line — render with inline **bold** + links
    blocks.push(<span key={key++}>{renderInline(line, linkColor, linkify)}</span>);
    // Separate consecutive plain lines with a soft <br>
    if (i + 1 < lines.length && lines[i + 1].trim() && !/^[-*]\s+/.test(lines[i + 1])) {
      blocks.push(<br key={key++} />);
    }
    i++;
  }

  return <>{blocks}</>;
}

// Alleen http(s) wordt een klikbare <a> — javascript:/data:/mailto: e.d. nooit
// (XSS-veiligheid). Tweede verdedigingslinie naast de server-side sanitizer.
function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Regel die uit precies één veilige link bestaat (optioneel gevolgd door een
// leesteken). Anders null → gewone inline-weergave.
const LONE_LINK_RE = /^\s*\[([^\]]+)\]\(([^)\s]+)\)\s*[.,;]?\s*$/;

function loneLink(line: string): { label: string; url: string } | null {
  const m = LONE_LINK_RE.exec(line);
  if (!m || !isSafeHttpUrl(m[2])) return null;
  return { label: m[1].replace(/\*\*/g, ''), url: m[2] };
}

function linkKind(url: string): 'document' | 'download' | 'page' {
  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return 'page';
  }
  if (/\.(pdf|docx?|xlsx?|pptx?|txt)$/.test(path)) return 'document';
  if (/\.(zip|rar|7z|exe|msi|dmg|tar|gz)$/.test(path)) return 'download';
  return 'page';
}

// Kleur via widget.css (--cmw-accent op het icoon, tekst in --cmw-ink): een lichte
// klantkleur als tekstkleur zou onleesbaar worden.
function linkButton(l: { label: string; url: string }, key: number): ReactNode {
  const kind = linkKind(l.url);
  return (
    <a
      key={key}
      className="cmw-linkbtn"
      data-kind={kind}
      href={l.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <LinkIcon kind={kind} />
      <span className="cmw-linkbtn-label">{l.label}</span>
    </a>
  );
}

function LinkIcon({ kind }: { kind: 'document' | 'download' | 'page' }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'cmw-linkbtn-icon',
  };
  if (kind === 'document') {
    return (
      <svg {...common}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </svg>
    );
  }
  if (kind === 'download') {
    return (
      <svg {...common}>
        <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

// Inline-parser: **bold** én [tekst](url). Eén regex die beide tokens matcht;
// tussenliggende tekst blijft platte string. Een onveilige/niet-http URL valt
// terug op de kale label-tekst.
const INLINE_RE = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, linkColor?: string, linkify = true): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={k++}>{token.slice(2, -2)}</strong>);
    } else {
      const close = token.indexOf('](');
      const label = token.slice(1, close);
      const url = token.slice(close + 2, -1);
      // Alleen klikbaar als linkify (= niet mid-stream) én veilig http(s).
      // Anders kale label-tekst (tijdens streaming, of bij onveilige URL).
      if (linkify && isSafeHttpUrl(url)) {
        parts.push(
          <a
            key={k++}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: linkColor ?? 'inherit', textDecoration: 'underline', fontWeight: 500 }}
          >
            {label}
          </a>,
        );
      } else {
        parts.push(label);
      }
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  // Strings render directly zonder wrapper — houdt <li>X</li> schoon. Lege
  // strings (uit slicing) overslaan.
  return parts.filter((p) => p !== '');
}
