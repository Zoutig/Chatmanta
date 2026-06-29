// Admin Dashboard — documenttekst-extractie voor echte file-uploads (taak 1).
//
// Haalt platte tekst uit een geüpload bestand zodat het door ingestText() gechunkt
// en geëmbed kan worden. PDF via pdf-parse, DOCX via mammoth, TXT/MD direct als UTF-8.
// Server-only: de libs zijn zwaar en draaien alleen op de server (in de upload-action).
//
// Gescande PDF's zonder tekstlaag geven lege tekst terug; de action vangt dat af met
// een INGEST_READ_FAILED zodat de admin een duidelijke melding krijgt.

import 'server-only';
import * as mammoth from 'mammoth';
import type { AllowedDocExt } from './doc-ext';

// De ext-allowlist is pure data → leeft in doc-ext.ts (client-safe, geen server-only).
// Hier re-geëxporteerd zodat bestaande server-side callers (admin-crawl, v1-ingest,
// de V1-upload-action) hun import-pad behouden.
export { ALLOWED_DOC_EXT, isAllowedDocExt } from './doc-ext';
export type { AllowedDocExt } from './doc-ext';

export async function extractDocText(buffer: Buffer, ext: AllowedDocExt): Promise<string> {
  switch (ext) {
    case 'pdf':
      return parsePdf(buffer);
    case 'docx': {
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    case 'txt':
    case 'md':
      return buffer.toString('utf-8');
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 = de PDFParse-class (pdfjs onder de motorkap). Dynamisch geïmporteerd
  // + via serverExternalPackages (next.config) geëxternaliseerd, zodat de bundler pdfjs
  // niet probeert mee te bundelen. destroy() ruimt de pdfjs-worker/resources op.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const { text } = await parser.getText();
    return text;
  } finally {
    await parser.destroy();
  }
}
