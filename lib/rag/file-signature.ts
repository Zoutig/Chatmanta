// Magic-bytes-validatie voor geüploade documenten — defense-in-depth bovenop de
// ext-allowlist en de Storage MIME-cap. Puur (geen deps, geen `server-only`) zodat
// het unit-testbaar blijft en in zowel server-actions als scripts bruikbaar is.
//
// Waarom: een client kan liegen over extensie én MIME-type; de eerste bytes van het
// bestand niet (zonder de inhoud écht te vervalsen). PDF en DOCX hebben stabiele
// container-signatures. TXT/MD zijn vrije tekst zonder signature → we accepteren ze
// en vertrouwen op de UTF-8-decode in extractDocText (verkeerde "tekst" levert hooguit
// ruis op, geen exploit).
import type { AllowedDocExt } from './doc-ext';

export function verifyMagicBytes(buffer: Buffer, ext: AllowedDocExt): boolean {
  switch (ext) {
    case 'pdf':
      // %PDF  → 25 50 44 46
      return buffer.length >= 4 &&
        buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
    case 'docx':
      // PK\x03\x04 → 50 4B 03 04 (zip-container; DOCX = OOXML-zip)
      return buffer.length >= 4 &&
        buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    case 'txt':
    case 'md':
      return true;
  }
}
