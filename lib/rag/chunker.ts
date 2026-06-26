// Pure parent/child-chunker — GEEN server-deps (geen `import 'server-only'`), zodat
// de chunk-logica los unit-testbaar is onder plain `node --test`. ingestDocument
// (server-only) composeert dit. Sizes uit scripts/v0-seed-orgs.ts: parent 3200/400,
// child 800/100. V0's eigen flat ingestText (chunkText 2000/200) blijft ongemoeid.

const PARENT_CHUNK_CHARS = 3200;
const PARENT_OVERLAP_CHARS = 400;
const CHILD_CHUNK_CHARS = 800;
const CHILD_OVERLAP_CHARS = 100;

export function chunkSliding(text: string, size: number, overlap: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= size) return [trimmed];
  const stride = size - overlap;
  if (stride <= 0) throw new Error(`bad config: size=${size}, overlap=${overlap}`);
  const out: string[] = [];
  for (let start = 0; start < trimmed.length; start += stride) {
    const slice = trimmed.slice(start, start + size).trim();
    if (slice.length > 0) out.push(slice);
  }
  return out;
}

export type ParentChild = {
  parents: string[];
  children: { parentIndex: number; content: string }[];
};

export function chunkParentsAndChildren(text: string): ParentChild {
  const parents = chunkSliding(text, PARENT_CHUNK_CHARS, PARENT_OVERLAP_CHARS);
  const children: { parentIndex: number; content: string }[] = [];
  for (let pi = 0; pi < parents.length; pi++) {
    for (const s of chunkSliding(parents[pi], CHILD_CHUNK_CHARS, CHILD_OVERLAP_CHARS)) {
      children.push({ parentIndex: pi, content: s });
    }
  }
  return { parents, children };
}
