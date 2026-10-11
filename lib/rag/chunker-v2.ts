// Index-versie v2 (ingest-onderzoek okt 2026, fase B): knippen op kopjes.
// - Parent = sectie (kop niveau ≤ 2; te grote secties gesplitst op niveau 3), max ±3200 tekens.
// - Child = record-eenheid tot 1200 tekens: FAQ-vraag + antwoord atomair, tabellen in
//   rijgroepen mét kopregel, kleine eenheden onder dezelfde kop samengevoegd.
// - Kruimelpad ("Paginatitel › H2 › H3") alleen voor de EMBED-tekst; `content` blijft de
//   letterlijke brontekst (LLM, claim-verify, excerpts en documentviewers zien niets nieuws).
// Tekst zonder kopjes (PDF/DOCX) valt terug op knippen op alinea/regel/zin-grenzen.
// Pure module (geen server-deps) — 1-op-1 port van eval-out/ingest-onderzoek-2026-10/chunkers.cjs (K3-1200 + bc).

export type ChunkV2 = {
  parents: string[];
  children: { parentIndex: number; content: string; embedText: string }[];
};

const PARENT_MAX = 3200;
const CHILD_SIZE = 1200;

type Block = { type: 'heading' | 'para' | 'list' | 'table'; level?: number; title?: string; text: string };
type Unit = { text: string; flush?: boolean };

function findCut(text: string, from: number, to: number): number {
  // beste knip in [from, to): alinea > regel > zin > spatie
  const win = text.slice(from, to);
  const tries = [/\n\s*\n/g, /\n/g, /[.!?:;](\s)/g, /\s/g];
  for (const re of tries) {
    let last = -1;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(win))) last = m.index + m[0].length;
    if (last > 0) return from + last;
  }
  return to;
}

export function boundedSplit(text: string, size: number, overlap: number): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= size) return [t];
  const out: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + size, t.length);
    if (end < t.length) end = findCut(t, start + Math.floor(size * 0.6), end);
    const piece = t.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= t.length) break;
    // volgende start: overlap terug, maar vooruit naar een woordgrens
    let ns = Math.max(end - overlap, start + 1);
    if (overlap > 0) {
      const sp = t.slice(ns, end).search(/\s/);
      ns = sp >= 0 ? ns + sp + 1 : end;
    } else ns = end;
    start = ns;
  }
  return out;
}

const HEAD = /^(#{1,6})\s+(.*)$/;
const LIST = /^\s*([-*+]|\d+[.)])\s+/;

function toBlocks(text: string): Block[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let cur: { type: Block['type']; lines: string[]; blank?: boolean } | null = null;
  const flush = () => {
    if (cur) {
      const t = cur.lines.join('\n').trim();
      if (t) blocks.push({ type: cur.type, text: t });
      cur = null;
    }
  };
  for (const line of lines) {
    const h = line.match(HEAD);
    if (h) {
      flush();
      blocks.push({ type: 'heading', level: h[1].length, title: h[2].trim(), text: line.trim() });
      continue;
    }
    if (!line.trim()) {
      if (cur && (cur as { type: string }).type !== 'list') flush();
      else if (cur) (cur as { blank?: boolean }).blank = true;
      continue;
    }
    const type: Block['type'] = line.trim().startsWith('|') ? 'table' : LIST.test(line) ? 'list' : 'para';
    const c = cur as { type: Block['type']; lines: string[]; blank?: boolean } | null;
    if (c && c.type === 'list' && c.blank && type !== 'list' && !/^\s{2,}/.test(line)) flush();
    const c2 = cur as { type: Block['type']; lines: string[]; blank?: boolean } | null;
    if (c2 && (c2.type === type || (c2.type === 'list' && /^\s{2,}/.test(line)))) {
      c2.lines.push(line);
      c2.blank = false;
      continue;
    }
    flush();
    cur = { type, lines: [line] };
  }
  flush();
  return blocks;
}

const blocksLen = (bs: Block[]) => bs.reduce((s, b) => s + b.text.length + 2, 0);

// secties: nieuwe sectie bij kop niveau ≤ 2; te grote secties op niveau 3 splitsen
function sections(blocks: Block[], maxChars: number): Block[][] {
  const secs: Block[][] = [];
  let cur: Block[] = [];
  for (const b of blocks) {
    if (b.type === 'heading' && (b.level ?? 9) <= 2 && cur.length) {
      secs.push(cur);
      cur = [];
    }
    cur.push(b);
  }
  if (cur.length) secs.push(cur);
  const out: Block[][] = [];
  for (const s of secs) {
    if (blocksLen(s) <= maxChars) {
      out.push(s);
      continue;
    }
    const subs: Block[][] = [];
    let c: Block[] = [];
    for (const b of s) {
      if (b.type === 'heading' && (b.level ?? 0) >= 3 && c.length) {
        subs.push(c);
        c = [];
      }
      c.push(b);
    }
    if (c.length) subs.push(c);
    let acc: Block[] = [];
    for (const sub of subs) {
      if (acc.length && blocksLen(acc) + blocksLen(sub) > maxChars) {
        out.push(acc);
        acc = [];
      }
      acc = acc.concat(sub);
    }
    if (acc.length) out.push(acc);
  }
  // mini-secties (< 300 tekens) samenvoegen met de volgende
  const merged: Block[][] = [];
  let carry: Block[] = [];
  for (const s of out) {
    const s2 = carry.concat(s);
    if (blocksLen(s2) < 300) {
      carry = s2;
      continue;
    }
    merged.push(s2);
    carry = [];
  }
  if (carry.length) {
    if (merged.length) merged[merged.length - 1] = merged[merged.length - 1].concat(carry);
    else merged.push(carry);
  }
  return merged;
}

const joinBlocks = (bs: Block[]) => bs.map((b) => b.text).join('\n\n');

// tabel splitsen in rijgroepen met herhaalde kopregel
function splitTable(text: string, size: number): string[] {
  const lines = text.split('\n');
  const hasSep = lines.length > 1 && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1]) && lines[1].includes('-');
  const head = hasSep ? lines.slice(0, 2) : lines.slice(0, 1);
  const rows = lines.slice(head.length);
  const out: string[] = [];
  let cur: string[] = [];
  const curLen = () => head.join('\n').length + cur.join('\n').length + 1;
  for (const r of rows) {
    if (cur.length && curLen() + r.length > size) {
      out.push(head.concat(cur).join('\n'));
      cur = [];
    }
    cur.push(r);
  }
  if (cur.length) out.push(head.concat(cur).join('\n'));
  return out.length ? out : [text];
}

// records: FAQ-vraag + antwoord atomair, tabel-rijgroepen met kopregel, flush bij elke kop
function recordUnits(bs: Block[], size: number): Unit[] {
  const groups: { heading: Block | null; blocks: Block[] }[] = [];
  let g: { heading: Block | null; blocks: Block[] } = { heading: null, blocks: [] };
  for (const b of bs) {
    if (b.type === 'heading') {
      if (g.heading || g.blocks.length) groups.push(g);
      g = { heading: b, blocks: [] };
      continue;
    }
    g.blocks.push(b);
  }
  if (g.heading || g.blocks.length) groups.push(g);
  const units: Unit[] = [];
  let carryHead = '';
  for (const gr of groups) {
    if (!gr.blocks.length && gr.heading) {
      carryHead += (carryHead ? '\n\n' : '') + gr.heading.text;
      continue;
    }
    const ht = [carryHead, gr.heading ? gr.heading.text : ''].filter(Boolean).join('\n\n');
    carryHead = '';
    const isFaq = !!gr.heading && /\?\s*\**\s*$/.test(gr.heading.title ?? '');
    const pieces: string[] = [];
    for (const b of gr.blocks) {
      if (b.type === 'table' && b.text.length > size - ht.length) splitTable(b.text, size - ht.length - 2).forEach((t) => pieces.push(t));
      else if (b.text.length > size) boundedSplit(b.text, size - (isFaq ? ht.length + 2 : 0), 100).forEach((t) => pieces.push(t));
      else pieces.push(b.text);
    }
    // pack binnen de groep; kop vóór het eerste stuk, en bij FAQ vóór élk stuk
    let cur = ht;
    let first = true;
    const emit = () => {
      if (cur.trim()) units.push({ text: cur.trim(), flush: true });
    };
    if (!pieces.length) {
      emit();
      continue;
    }
    for (const p of pieces) {
      const add = (cur ? '\n\n' : '') + p;
      if (cur && cur.length + add.length > size && !(first && cur === ht)) {
        emit();
        cur = (isFaq ? ht + '\n\n' : '') + p;
      } else cur += add;
      first = false;
    }
    emit();
  }
  if (carryHead) units.push({ text: carryHead, flush: true });
  return units;
}

// opeenvolgende kleine eenheden (< 35% van size) samenvoegen tot size, niet over FAQ-grenzen
function packRecordUnits(units: Unit[], size: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const u of units) {
    const isFaq = /^#{1,6}\s.*\?\s*\**\s*(\n|$)/.test(u.text);
    if (!isFaq && cur && cur.length + 2 + u.text.length <= size && u.text.length < size * 0.35 && !/^#{1,6}\s.*\?/.test(cur)) {
      cur += '\n\n' + u.text;
      continue;
    }
    if (cur) out.push(cur);
    cur = u.text;
  }
  if (cur) out.push(cur);
  return out;
}

// ---------- kruimelpad (alleen voor de embed-tekst) ----------
export const cleanInline = (s: string) =>
  s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

function headingIndex(text: string) {
  const idx: { pos: number; level: number; title: string }[] = [];
  const re = /^(#{1,6})\s+(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) idx.push({ pos: m.index, level: m[1].length, title: cleanInline(m[2]) });
  return idx;
}

function pathAt(idx: { pos: number; level: number; title: string }[], pos: number): Record<number, string> {
  const path: Record<number, string> = {};
  for (const h of idx) {
    if (h.pos > pos) break;
    path[h.level] = h.title;
    for (let l = h.level + 1; l <= 6; l++) delete path[l];
  }
  return path;
}

function locate(doc: string, child: string, cursor: number): number {
  // positie van de eerste inhoudsregel (geen kop), zodat het pad de koppen bóven deze chunk bevat
  const lines = child.trim().split('\n');
  const firstContent = lines.find((l) => l.trim() && !/^#{1,6}\s/.test(l)) ?? lines[0];
  const probe = firstContent.trim().slice(0, 50);
  let p = doc.indexOf(probe, Math.max(0, cursor - 4000));
  if (p < 0) p = doc.indexOf(probe);
  if (p < 0) p = doc.indexOf(child.trim().split('\n')[0].slice(0, 40));
  return p;
}

function breadcrumbs(doc: string, title: string, children: { content: string }[]): string[] {
  const idx = headingIndex(doc);
  let cursor = 0;
  return children.map((c) => {
    const p = locate(doc, c.content, cursor);
    if (p >= 0) cursor = p;
    const path = p >= 0 ? pathAt(idx, p) : {};
    const parts = title ? [title] : [];
    for (const l of [2, 3]) if (path[l] && !parts.includes(path[l])) parts.push(path[l]);
    return parts.join(' › ');
  });
}

/** Documenttitel voor het kruimelpad: eerste H1, anders de bestandsnaam zonder extensie/volgnummer. */
export function documentTitle(text: string, filename: string): string {
  const h1 = text.match(/^#\s+(.+)$/m)?.[1];
  return cleanInline(h1 || filename.replace(/\.[a-z0-9]+$/i, '').replace(/^\d+[-_]/, ''));
}

/** `title` leeg = geen documenttitel in het kruimelpad (bv. losse Q&A-items). */
export function chunkByHeadings(text: string, title: string): ChunkV2 {
  const doc = text.replace(/\r\n/g, '\n');
  const secs = sections(toBlocks(doc), PARENT_MAX);
  const parents: string[] = [];
  const raw: { parentIndex: number; content: string }[] = [];
  for (const s of secs) {
    let ptexts = [joinBlocks(s)];
    if (ptexts[0].length > PARENT_MAX * 1.25) ptexts = boundedSplit(ptexts[0], PARENT_MAX, 200);
    for (const pt of ptexts) {
      const pi = parents.length;
      parents.push(pt);
      const bs = ptexts.length > 1 ? toBlocks(pt) : s;
      for (const c of packRecordUnits(recordUnits(bs, CHILD_SIZE), CHILD_SIZE)) raw.push({ parentIndex: pi, content: c });
    }
  }
  const crumbs = breadcrumbs(doc, title, raw);
  return {
    parents,
    children: raw.map((c, i) => ({ ...c, embedText: crumbs[i] ? `${crumbs[i]}\n\n${c.content}` : c.content })),
  };
}
