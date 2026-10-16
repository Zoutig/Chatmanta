'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR-code met een tel:-link: scan met je telefoon en hij belt. */
export function TelQr({ tel }: { tel: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let weg = false;
    QRCode.toString(tel, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(
      (s) => !weg && setSvg(s),
      () => !weg && setSvg(''),
    );
    return () => {
      weg = true;
    };
  }, [tel]);
  if (!svg) return null;
  // De SVG komt uit de qrcode-library op basis van ons eigen tel:-nummer (genormaliseerd +31…), niet uit gebruikersinvoer-HTML.
  return <div className="ld-qr" role="img" aria-label="QR-code om te bellen" dangerouslySetInnerHTML={{ __html: svg }} />;
}
