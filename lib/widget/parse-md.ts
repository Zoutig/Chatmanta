// Parseer markdown naar een structured-document-tree zodat de per-kind
// page-templates met semantische data kunnen werken (sections, lists,
// tables) i.p.v. opaque ReactNode-blocks.
//
// Bewust eigen mini-parser — past op de markdown-subset in
// `scripts/fixtures/sandbox-orgs/<slug>/*.md` (zie render-markdown.tsx
// voor de support-lijst). Niet bedoeld als algemene markdown-parser.

export type ParsedBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] };

export type ParsedSection = {
  /** Heading-tekst zonder leading `#`. `null` voor "pre-heading" inhoud. */
  heading: string | null;
  /** Heading-level (2 of 3); `null` voor pre-heading section. */
  level: 2 | 3 | null;
  /** Body-blocks direct onder de heading (vóór een sub-heading). */
  blocks: ParsedBlock[];
  /** H3-subsections wanneer dit een H2 is. Voor H3 of pre-heading: leeg. */
  children: ParsedSection[];
};

export type ParsedDoc = {
  /** Eerste H1-tekst, of lege string. */
  title: string;
  /** Eerste paragraaf-tekst direct onder H1, of lege string. */
  lead: string;
  /** Pre-heading content (na lead, vóór eerste H2). */
  intro: ParsedBlock[];
  /** H2-sections, in volgorde. */
  sections: ParsedSection[];
};

export function parseMarkdown(raw: string): ParsedDoc {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const allBlocks = collectBlocksAndHeadings(lines);

  let title = '';
  let lead = '';
  const intro: ParsedBlock[] = [];
  const sections: ParsedSection[] = [];

  let i = 0;

  // Eerst H1 + lead pakken
  const first = allBlocks[i];
  if (first && first.type === 'heading' && first.level === 1) {
    title = first.text;
    i++;
  }
  const maybeLead = allBlocks[i];
  if (maybeLead && maybeLead.type === 'paragraph') {
    lead = maybeLead.text;
    i++;
  }

  // Verzamel intro-blocks tot we een heading tegenkomen
  while (i < allBlocks.length && allBlocks[i].type !== 'heading') {
    const b = allBlocks[i];
    if (b.type === 'paragraph') intro.push({ type: 'paragraph', text: b.text });
    else if (b.type === 'list') intro.push({ type: 'list', ordered: b.ordered, items: b.items });
    else if (b.type === 'table') intro.push({ type: 'table', header: b.header, rows: b.rows });
    i++;
  }

  // Bouw section-tree (H2 → H3 children)
  let currentH2: ParsedSection | null = null;
  let currentH3: ParsedSection | null = null;

  while (i < allBlocks.length) {
    const b = allBlocks[i];

    if (b.type === 'heading' && b.level === 2) {
      currentH2 = { heading: b.text, level: 2, blocks: [], children: [] };
      currentH3 = null;
      sections.push(currentH2);
      i++;
      continue;
    }

    if (b.type === 'heading' && b.level === 3) {
      if (!currentH2) {
        // H3 zonder voorafgaande H2 — promote naar H2 zodat hij niet verloren gaat
        currentH2 = { heading: b.text, level: 2, blocks: [], children: [] };
        sections.push(currentH2);
        currentH3 = null;
      } else {
        currentH3 = { heading: b.text, level: 3, blocks: [], children: [] };
        currentH2.children.push(currentH3);
      }
      i++;
      continue;
    }

    // H1 mid-document → ignoreren (eerste was de title)
    if (b.type === 'heading') {
      i++;
      continue;
    }

    const target = currentH3 ?? currentH2;
    if (target) {
      if (b.type === 'paragraph') target.blocks.push({ type: 'paragraph', text: b.text });
      else if (b.type === 'list')
        target.blocks.push({ type: 'list', ordered: b.ordered, items: b.items });
      else if (b.type === 'table')
        target.blocks.push({ type: 'table', header: b.header, rows: b.rows });
    } else {
      // Geen current section — voeg toe aan intro
      if (b.type === 'paragraph') intro.push({ type: 'paragraph', text: b.text });
      else if (b.type === 'list')
        intro.push({ type: 'list', ordered: b.ordered, items: b.items });
      else if (b.type === 'table')
        intro.push({ type: 'table', header: b.header, rows: b.rows });
    }
    i++;
  }

  return { title, lead, intro, sections };
}

type IntermediateBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] };

function collectBlocksAndHeadings(lines: string[]): IntermediateBlock[] {
  const out: IntermediateBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      out.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Pipe-tabel
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const header = parseTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      out.push({ type: 'table', header, rows });
      continue;
    }

    // Bullet-lijst
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push({ type: 'list', ordered: false, items });
      continue;
    }

    // Genummerde lijst
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push({ type: 'list', ordered: true, items });
      continue;
    }

    // Paragraaf
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
    out.push({ type: 'paragraph', text: para.join(' ') });
  }

  return out;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\||\|$/g, '');
  return trimmed.split('|').map((c) => c.trim());
}
