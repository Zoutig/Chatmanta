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
  // <answer>-wrappers + een (mogelijk nog open) <confidence>-staart.
  s = s.replace(/<\/?answer>/gi, '');
  s = s.replace(/<confidence>[\s\S]*$/i, '');
  // [n]-citaties.
  s = s.replace(/\s*\[\d+\](\[\d+\])*/g, '');
  // Halve trailing tag aan het buffer-einde ("<", "<a", "<thi"…) afknippen
  // zodat hij niet als zichtbare tekst flikkert tijdens streaming.
  s = s.replace(/<[a-z/]*$/i, '');
  return s.trim();
}

export function renderMarkdownLite(text: string): ReactNode {
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
              {renderInlineBold(it)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Plain line — render with inline **bold**
    blocks.push(<span key={key++}>{renderInlineBold(line)}</span>);
    // Separate consecutive plain lines with a soft <br>
    if (i + 1 < lines.length && lines[i + 1].trim() && !/^[-*]\s+/.test(lines[i + 1])) {
      blocks.push(<br key={key++} />);
    }
    i++;
  }

  return <>{blocks}</>;
}

function renderInlineBold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  // Strings render directly without a wrapper tag — keeps <li>X</li> clean
  // instead of <li><span>X</span></li>. Empty strings (from split) are skipped.
  return parts
    .filter((p) => p.length > 0)
    .map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return <strong key={i}>{p.slice(2, -2)}</strong>;
      }
      return p;
    });
}
