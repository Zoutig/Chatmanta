// V0 char-based chunker. Splits raw text into overlapping windows.
//
// Tradeoff: char-based is approximation — 1 token ≈ 3-4 chars (NL/EN). For V0
// leerprototype dat is goed genoeg; echte token-counting (tiktoken) komt in
// Fase 4 hardening samen met cost-budgetting per chunk.
//
// CHUNK_CHARS / OVERLAP_CHARS staan hier hardcoded ipv via lib/rag/config.ts:
// die config gebruikt tokens, V0 chunker werkt in chars. Bewuste duplicatie —
// V0 mag niet de canonical RAG_CONFIG aanpassen, want die is bron-van-waarheid
// voor V1 hardening.

const CHUNK_CHARS = 2000;
const OVERLAP_CHARS = 200;

/**
 * Split a string into overlapping char-windows. Last chunk may be shorter.
 * Strips empty/whitespace-only chunks.
 *
 * @param {string} text  raw input text
 * @returns {string[]}   chunks ready to embed
 */
export function chunkText(text) {
  if (typeof text !== 'string') {
    throw new TypeError('chunkText expects a string');
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= CHUNK_CHARS) return [trimmed];

  const stride = CHUNK_CHARS - OVERLAP_CHARS;
  if (stride <= 0) {
    throw new Error('OVERLAP_CHARS must be smaller than CHUNK_CHARS');
  }

  const chunks = [];
  for (let start = 0; start < trimmed.length; start += stride) {
    const slice = trimmed.slice(start, start + CHUNK_CHARS).trim();
    if (slice.length > 0) chunks.push(slice);
    if (start + CHUNK_CHARS >= trimmed.length) break;
  }
  return chunks;
}

export const V0_CHUNKER_CONFIG = { CHUNK_CHARS, OVERLAP_CHARS };
