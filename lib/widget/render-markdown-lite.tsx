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

export function renderMarkdownLite(text: string): ReactNode {
  let clean = text;
  clean = clean.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
  clean = clean.replace(/<\/?answer>/g, '');
  clean = clean.replace(/<confidence>[\s\S]*?<\/confidence>/g, '');
  clean = clean.replace(/\s*\[\d+\](\[\d+\])*/g, '');
  clean = clean.trim();

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
