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

export function renderMarkdownLite(text: string, linkColor?: string): ReactNode {
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
              {renderInline(it, linkColor)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Plain line — render with inline **bold** + links
    blocks.push(<span key={key++}>{renderInline(line, linkColor)}</span>);
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

// Inline-parser: **bold** én [tekst](url). Eén regex die beide tokens matcht;
// tussenliggende tekst blijft platte string. Een onveilige/niet-http URL valt
// terug op de kale label-tekst.
const INLINE_RE = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, linkColor?: string): ReactNode {
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
      if (isSafeHttpUrl(url)) {
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
