// Hand-rolled markdown → React renderer voor /widget fake-website pagina's.
//
// Bewust een mini-implementatie: geen npm-dep, en alleen de markdown-subset
// die in `scripts/fixtures/sandbox-orgs/<slug>/*.md` voorkomt:
//   - H1 / H2 / H3 (geen H4+)
//   - Paragrafen (lines gescheiden door blank line)
//   - Bullet-lijsten (`- ` / `* `)
//   - Genummerde lijsten (`1. `)
//   - Pipe-tabellen (`| col | col |` met `|---|---|` separator)
//   - Inline: **bold**, *italic*, [text](href), `code`
//
// Niet ondersteund: blockquotes, nested lists, code-fences, images,
// strikethrough, raw HTML. Onbekende constructs vallen terug naar
// paragraaf-tekst zodat een bron-update niet crasht.
//
// Inline-style approach (geen Tailwind) past bij de bestaande
// fake-site.tsx en omzeilt de Tailwind v4 PostCSS-drop-quirk voor
// dynamische skin-kleuren.

import type { CSSProperties, ReactNode } from 'react';

export type MarkdownTheme = {
  primaryColor: string;
  textColor: string;
  mutedText: string;
  borderColor: string;
  cardColor: string;
};

export function renderMarkdown(raw: string, theme: MarkdownTheme): ReactNode {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank lijn → blok-scheider
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push(
        <Heading key={key++} level={level} theme={theme}>
          {renderInline(headingMatch[2], theme)}
        </Heading>,
      );
      i++;
      continue;
    }

    // Pipe-tabel — header-rij start met `|` en volgende lijn is separator
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const header = parseTableRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push(<Table key={key++} header={header} rows={rows} theme={theme} />);
      continue;
    }

    // Bullet-lijst (consume opeenvolgende `- ` of `* ` lijnen)
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
            margin: '0 0 18px',
            paddingLeft: 22,
            lineHeight: 1.65,
            fontSize: 15,
          }}
        >
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 4 }}>
              {renderInline(it, theme)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Genummerde lijst
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol
          key={key++}
          style={{
            margin: '0 0 18px',
            paddingLeft: 22,
            lineHeight: 1.65,
            fontSize: 15,
          }}
        >
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 4 }}>
              {renderInline(it, theme)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraaf — verzamel opeenvolgende non-blank, non-block-start lijnen
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s/.test(lines[i]) &&
      !lines[i].trim().startsWith('|') &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p
        key={key++}
        style={{
          margin: '0 0 16px',
          lineHeight: 1.65,
          fontSize: 15,
          color: theme.textColor,
        }}
      >
        {renderInline(para.join(' '), theme)}
      </p>,
    );
  }

  return <>{blocks}</>;
}

// ---------------------------------------------------------------------------
// Inline tokenizer — bold > italic > link > code, gecombineerd in één regex.
// Belangrijk: alternation-volgorde bepaalt match-priority (bold vóór italic
// zodat `**x**` niet onbedoeld als `*x*` matcht).
// ---------------------------------------------------------------------------
const INLINE_PATTERN = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|\[[^\]\n]+?\]\([^)\n]*?\)|`[^`\n]+?`)/g;

function renderInline(text: string, theme: MarkdownTheme): ReactNode {
  if (!text) return null;
  const parts = text.split(INLINE_PATTERN).filter((p) => p !== undefined);
  return (
    <>
      {parts.map((p, idx) => {
        if (!p) return null;

        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={idx}>{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith('*') && p.endsWith('*') && p.length > 2 && !p.startsWith('**')) {
          return <em key={idx}>{p.slice(1, -1)}</em>;
        }
        if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
          return (
            <code
              key={idx}
              style={{
                background: theme.cardColor,
                border: `1px solid ${theme.borderColor}`,
                padding: '0 5px',
                borderRadius: 4,
                fontSize: '0.92em',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {p.slice(1, -1)}
            </code>
          );
        }
        const linkMatch = p.match(/^\[([^\]]+)\]\(([^)]*)\)$/);
        if (linkMatch) {
          const label = linkMatch[1];
          const href = linkMatch[2];
          // Placeholder-links (`(#)`, leeg) — render als geaccentueerde span,
          // geen <a>. De .md-bronnen verwijzen vaak naar andere fixture-files
          // via `(#)` als platte placeholder.
          if (!href || href === '#') {
            return (
              <span
                key={idx}
                style={{ color: theme.primaryColor, fontWeight: 500 }}
              >
                {label}
              </span>
            );
          }
          return (
            <a
              key={idx}
              href={href}
              style={{ color: theme.primaryColor, textDecoration: 'underline' }}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
            >
              {label}
            </a>
          );
        }
        return <span key={idx}>{p}</span>;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Heading-component — H1/H2/H3 met progressief kleinere font + spacing.
// H1 krijgt primaryColor-accent; H2/H3 blijven textColor.
// ---------------------------------------------------------------------------
function Heading({
  level,
  theme,
  children,
}: {
  level: 1 | 2 | 3;
  theme: MarkdownTheme;
  children: ReactNode;
}) {
  const stylesByLevel: Record<1 | 2 | 3, CSSProperties> = {
    1: {
      fontSize: 36,
      lineHeight: 1.15,
      letterSpacing: '-0.02em',
      fontWeight: 700,
      color: theme.textColor,
      margin: '0 0 24px',
      paddingBottom: 12,
      borderBottom: `2px solid ${theme.primaryColor}`,
    },
    2: {
      fontSize: 22,
      lineHeight: 1.25,
      letterSpacing: '-0.01em',
      fontWeight: 700,
      color: theme.textColor,
      margin: '28px 0 12px',
    },
    3: {
      fontSize: 17,
      lineHeight: 1.35,
      fontWeight: 600,
      color: theme.mutedText,
      margin: '22px 0 8px',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
  };

  const style = stylesByLevel[level];
  if (level === 1) return <h1 style={style}>{children}</h1>;
  if (level === 2) return <h2 style={style}>{children}</h2>;
  return <h3 style={style}>{children}</h3>;
}

// ---------------------------------------------------------------------------
// Tabel — pipe-syntaxis. Eerste rij = header, daarna data-rijen.
// ---------------------------------------------------------------------------
function Table({
  header,
  rows,
  theme,
}: {
  header: string[];
  rows: string[][];
  theme: MarkdownTheme;
}) {
  return (
    <div style={{ overflowX: 'auto', margin: '0 0 20px' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          fontSize: 14,
          lineHeight: 1.45,
        }}
      >
        <thead>
          <tr>
            {header.map((cell, idx) => (
              <th
                key={idx}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderBottom: `2px solid ${theme.borderColor}`,
                  fontWeight: 600,
                  color: theme.textColor,
                }}
              >
                {renderInline(cell, theme)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ridx) => (
            <tr key={ridx}>
              {row.map((cell, cidx) => (
                <td
                  key={cidx}
                  style={{
                    padding: '8px 12px',
                    borderBottom: `1px solid ${theme.borderColor}`,
                    color: theme.textColor,
                    verticalAlign: 'top',
                  }}
                >
                  {renderInline(cell, theme)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseTableRow(line: string): string[] {
  // `| a | b | c |` → ['a', 'b', 'c']. Trim leading/trailing pipe.
  const trimmed = line.trim().replace(/^\||\|$/g, '');
  return trimmed.split('|').map((c) => c.trim());
}
